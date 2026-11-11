import "server-only";
import { randomUUID } from "node:crypto";
import { getPrisma } from "@/lib/prisma";
import type { VerifiedIdentity } from "@/lib/session/identity-types";
import { uploadExtensions, type UploadFile } from "./upload-validation";
import { readImageMetadata, signImageUpload } from "@/lib/storage/s3-vault";

export class UploadError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export type UploadOwner = Exclude<VerifiedIdentity, { kind: "anonymous" }>;
function ownerWhere(owner: UploadOwner) {
  return owner.kind === "member"
    ? { userId: owner.userId }
    : { userId: null, guestDeviceId: owner.guestDeviceId };
}
function missingObject(): never {
  throw new UploadError(
    400,
    "STORAGE_OBJECT_NOT_FOUND",
    "스토리지에 업로드된 객체를 확인할 수 없거나 ETag가 일치하지 않습니다.",
  );
}

export async function createUpload(owner: UploadOwner, file: UploadFile) {
  const id = randomUUID();
  const s3Key = `raw-faces/${id}.${uploadExtensions[file.mimeType]}`;
  // Sign first: configuration failures must not consume an upload allowance.
  const uploadUrl = await signImageUpload(s3Key, file);
  const database = getPrisma();
  await database.$transaction(async (tx) => {
    const ownerKey =
      owner.kind === "member" ? `member:${owner.userId}` : `guest:${owner.guestDeviceId}`;
    // Serialize issuance per verified owner across processes; count and create share a transaction.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${ownerKey}, 0))::text`;
    const now = new Date();
    const count = await tx.imageUploadSession.count({
      where: { ...ownerWhere(owner), createdAt: { gt: new Date(now.getTime() - 3_600_000) } },
    });
    if (count >= 3)
      throw new UploadError(
        429,
        "RATE_LIMIT_EXCEEDED",
        "진단 이미지 업로드 요청 한도를 초과했습니다. 1시간 후 다시 시도해주세요.",
      );
    await tx.imageUploadSession.create({
      data: {
        id,
        s3Key,
        ...file,
        ...ownerWhere(owner),
        expiresAt: new Date(now.getTime() + 900_000),
      },
    });
  });
  return { uploadSessionId: id, uploadUrl, s3Key, expiresInSeconds: 900 };
}

export async function completeUpload(owner: UploadOwner, id: string, etag: string) {
  return getPrisma().$transaction(
    async (tx) => {
      // Lock the row so retries cannot overwrite the first confirmed timestamp.
      await tx.$queryRaw`SELECT id FROM image_upload_sessions WHERE id = ${id} FOR UPDATE`;
      const session = await tx.imageUploadSession.findUnique({ where: { id } });
      if (!session)
        throw new UploadError(
          404,
          "UPLOAD_SESSION_NOT_FOUND",
          "존재하지 않는 업로드 세션 식별자입니다.",
        );
      const owned =
        owner.kind === "member"
          ? session.userId === owner.userId
          : session.userId === null && session.guestDeviceId === owner.guestDeviceId;
      if (!owned)
        throw new UploadError(
          403,
          "FORBIDDEN_UPLOAD_SESSION",
          "해당 업로드 세션에 대한 완료 처리 권한이 없습니다.",
        );
      if (session.status === "UPLOADED") {
        if (session.etag !== etag) missingObject();
        return confirmation(session);
      }
      if (session.expiresAt.getTime() <= Date.now() || session.status === "EXPIRED") {
        throw new UploadError(
          410,
          "UPLOAD_SESSION_EXPIRED",
          "업로드 유효 시간이 만료되었습니다. 새 URL을 발급받아 재시도해주세요.",
        );
      }
      if (session.status !== "PENDING") missingObject();
      const metadata = await readImageMetadata(session.s3Key);
      if (
        !metadata ||
        metadata.etag !== etag ||
        metadata.size !== session.fileSizeBytes ||
        metadata.mimeType !== session.mimeType ||
        metadata.encryption !== "AES256"
      )
        missingObject();
      if (session.expiresAt.getTime() <= Date.now())
        throw new UploadError(
          410,
          "UPLOAD_SESSION_EXPIRED",
          "업로드 유효 시간이 만료되었습니다. 새 URL을 발급받아 재시도해주세요.",
        );
      const confirmed = await tx.imageUploadSession.update({
        where: { id },
        data: { status: "UPLOADED", etag },
      });
      return confirmation(confirmed);
    },
    { timeout: 15_000 },
  );
}
function confirmation(session: { id: string; s3Key: string; updatedAt: Date }) {
  return {
    uploadSessionId: session.id,
    status: "UPLOADED" as const,
    s3Key: session.s3Key,
    confirmedAt: session.updatedAt.toISOString(),
  };
}
