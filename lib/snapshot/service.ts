import "server-only";
import { generateSnapshotFeedback } from "./feedback";
import { randomUUID } from "node:crypto";
import { getPrisma } from "@/lib/prisma";
import type { DailySnapshot } from "@/generated/prisma/client";
import { getKstDate, getKstRecordDate } from "@/lib/dashboard/date";
import { readImageMetadata, signImageUpload, signImageView } from "@/lib/storage/s3-vault";
import type { UploadFile } from "@/lib/diagnostic/upload-validation";
import { AuthError } from "@/lib/auth/response";
import { recordSnapshotSchema, type SnapshotView } from "./types";
import type { z } from "zod";
const extensions = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const conflict = () =>
  new AuthError(409, "ALREADY_RECORDED_TODAY", "오늘의 피부 스냅샷이 이미 기록되었습니다.");
const invalid = () =>
  new AuthError(
    400,
    "INVALID_SNAPSHOT_DATA",
    "유효하지 않은 스냅샷 요청이거나 파일 검증에 실패했습니다.",
  );
export async function snapshotView(row: DailySnapshot): Promise<SnapshotView> {
  return {
    id: row.id,
    recordDate: row.recordDate.toISOString().slice(0, 10),
    feedbackComment: row.feedbackComment,
    feedbackSource: row.feedbackSource,
    conditions:
      row.feedbackSource === "AI"
        ? {
            hydrationLevel: row.hydrationLevel,
            soothingLevel: row.soothingLevel,
            sebumLevel: row.sebumLevel,
          }
        : null,
    viewUrl: await signImageView(row.s3Key),
    createdAt: row.createdAt.toISOString(),
  };
}
export async function getTodaySnapshot(userId: string, now = new Date()) {
  const row = await getPrisma().dailySnapshot.findUnique({
    where: { uq_user_daily_snapshot: { userId, recordDate: getKstRecordDate(now) } },
  });
  return row
    ? { recorded: true as const, snapshot: await snapshotView(row) }
    : { recorded: false as const, snapshot: null };
}
export async function issueSnapshotUpload(userId: string, file: UploadFile, now = new Date()) {
  if (
    await getPrisma().dailySnapshot.findUnique({
      where: { uq_user_daily_snapshot: { userId, recordDate: getKstRecordDate(now) } },
    })
  )
    throw conflict();
  const date = getKstRecordDate(now);
  const recordDate = getKstDate(now);
  const id = `snp-${randomUUID()}`;
  const s3Key = `daily-snapshots/${id}.${extensions[file.mimeType]}`;
  // Fail before creating a session if storage is not configured.
  const uploadUrl = await signImageUpload(s3Key, file, 300);
  await getPrisma().$transaction(async (tx) => {
    const lock = `snapshot:${userId}:${recordDate}`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lock},0))::text`;
    if (
      await tx.dailySnapshot.findUnique({
        where: { uq_user_daily_snapshot: { userId, recordDate: date } },
      })
    )
      throw conflict();
    if (
      (await tx.snapshotUploadSession.count({
        where: { userId, createdAt: { gt: new Date(now.getTime() - 3600000) } },
      })) >= 3
    )
      throw new AuthError(
        429,
        "SNAPSHOT_UPLOAD_LIMIT",
        "업로드 요청이 많습니다. 1시간 후 다시 시도해주세요.",
      );
    await tx.snapshotUploadSession.create({
      data: {
        id,
        userId,
        s3Key,
        ...file,
        recordDate: date,
        expiresAt: new Date(now.getTime() + 300000),
      },
    });
  });
  return { uploadSessionId: id, uploadUrl, s3Key, recordDate, expiresInSeconds: 300 };
}
export async function recordSnapshot(
  userId: string,
  input: z.infer<typeof recordSnapshotSchema>,
  now = new Date(),
) {
  const startedAt = Date.now();
  const recordDate = getKstRecordDate(now);
  return getPrisma().$transaction(
    async (tx) => {
      const lock = `snapshot:${userId}:${getKstDate(now)}`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lock},0))::text`;
      const replay = await tx.dailySnapshot.findUnique({
        where: { uq_snapshot_idempotency: { userId, idempotencyKey: input.idempotencyKey } },
      });
      if (replay) {
        if (replay.s3Key !== input.s3Key || replay.etag !== input.etag)
          throw new AuthError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "다른 사진에 사용한 요청입니다. 사진을 다시 선택해주세요.",
          );
        return { row: replay, created: false };
      }
      if (
        await tx.dailySnapshot.findUnique({
          where: { uq_user_daily_snapshot: { userId, recordDate } },
        })
      )
        throw conflict();
      const upload = await tx.snapshotUploadSession.findUnique({ where: { s3Key: input.s3Key } });
      if (!upload) throw invalid();
      if (upload.userId !== userId)
        throw new AuthError(403, "FORBIDDEN_SNAPSHOT", "이 사진을 기록할 권한이 없습니다.");
      if (upload.expiresAt <= now || upload.recordDate.getTime() !== recordDate.getTime())
        throw new AuthError(
          410,
          "SNAPSHOT_UPLOAD_EXPIRED",
          "사진 등록 시간이 지났습니다. 다시 선택해주세요.",
        );
      if (upload.status !== "PENDING") throw invalid();
      const object = await readImageMetadata(upload.s3Key);
      if (
        !object ||
        object.etag !== input.etag ||
        object.size !== upload.fileSizeBytes ||
        object.mimeType !== upload.mimeType ||
        object.encryption !== "AES256"
      )
        throw invalid();
      const feedback = await generateSnapshotFeedback(upload.s3Key);
      if (feedback.faceDetected === false)
        throw new AuthError(
          400,
          "FACE_NOT_DETECTED",
          "얼굴이 잘 인식되지 않았습니다. 밝은 곳에서 정면 사진을 다시 선택해주세요.",
        );
      const checkedAt = new Date(now.getTime() + Date.now() - startedAt);
      if (upload.expiresAt <= checkedAt || getKstDate(checkedAt) !== getKstDate(now))
        throw new AuthError(
          410,
          "SNAPSHOT_UPLOAD_EXPIRED",
          "사진 등록 시간이 지났습니다. 다시 선택해주세요.",
        );
      // General guidance is intentional degraded mode: do not invent image-derived measurements.
      const row = await tx.dailySnapshot.create({
        data: {
          userId,
          s3Key: upload.s3Key,
          recordDate,
          idempotencyKey: input.idempotencyKey,
          etag: input.etag,
          feedbackSource: feedback.feedbackSource,
          feedbackComment: feedback.feedbackComment,
          ...(feedback.conditions ?? {}),
        },
      });
      await tx.snapshotUploadSession.update({
        where: { id: upload.id },
        data: { status: "UPLOADED", etag: input.etag },
      });
      return { row, created: true };
    },
    { timeout: 15000 },
  );
}
