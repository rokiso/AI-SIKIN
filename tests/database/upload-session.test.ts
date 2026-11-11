import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
const storage = vi.hoisted(() => ({ sign: vi.fn(), head: vi.fn() }));
vi.mock("@/lib/storage/s3-vault", () => ({
  signImageUpload: storage.sign,
  readImageMetadata: storage.head,
}));
import { getPrisma } from "@/lib/prisma";
import { getDatabaseUrl } from "@/lib/server-env";
import { assertLocalDevelopmentDatabase } from "@/lib/database-development";
import { completeUpload, createUpload, type UploadOwner } from "@/lib/diagnostic/upload-session";

const db = getPrisma();
const guests = new Set<string>();
const users = new Set<string>();
const file = { mimeType: "image/jpeg" as const, fileSizeBytes: 10_240 };
const etag = '"0123456789abcdef0123456789abcdef"';
function guest(): UploadOwner {
  const id = randomUUID();
  guests.add(id);
  return { kind: "guest", guestDeviceId: id };
}
beforeAll(async () => {
  assertLocalDevelopmentDatabase(getDatabaseUrl());
  await db.$queryRaw`SELECT 1`;
});
afterEach(async () => {
  await db.imageUploadSession.deleteMany({
    where: { OR: [{ guestDeviceId: { in: [...guests] } }, { userId: { in: [...users] } }] },
  });
  await db.user.deleteMany({ where: { id: { in: [...users] } } });
  guests.clear();
  users.clear();
  vi.resetAllMocks();
});
afterAll(async () => db.$disconnect());
async function issue(owner = guest()) {
  storage.sign.mockResolvedValue("https://private-vault.invalid/signed");
  storage.head.mockResolvedValue({
    etag,
    size: file.fileSizeBytes,
    mimeType: file.mimeType,
    encryption: "AES256",
  });
  return { owner, upload: await createUpload(owner, file) };
}
describe("private upload lifecycle", () => {
  it("creates a random pending mapping with a 900 second lifetime", async () => {
    const { upload } = await issue();
    expect(upload.s3Key).toMatch(
      /^raw-faces\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpeg$/,
    );
    const row = await db.imageUploadSession.findUniqueOrThrow({
      where: { id: upload.uploadSessionId },
    });
    expect(row.status).toBe("PENDING");
    expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBeGreaterThanOrEqual(899_000);
    expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBeLessThanOrEqual(901_000);
  });
  it("limits concurrent guest and member issuance to three per hour", async () => {
    const user = await db.user.create({ data: { nickname: "업로드 테스트" } });
    users.add(user.id);
    const member: UploadOwner = {
      kind: "member",
      userId: user.id,
      nickname: user.nickname,
      role: "USER",
      guestDeviceId: null,
    };
    storage.sign.mockResolvedValue("https://private-vault.invalid/signed");
    for (const owner of [guest(), member]) {
      const results = await Promise.allSettled(
        Array.from({ length: 5 }, () => createUpload(owner, file)),
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
      for (const result of results)
        if (result.status === "rejected")
          expect(result.reason).toMatchObject({ status: 429, code: "RATE_LIMIT_EXCEEDED" });
    }
  });
  it("confirms once and returns identical results without another HEAD or update", async () => {
    const { owner, upload } = await issue();
    const first = await completeUpload(owner, upload.uploadSessionId, etag);
    expect(first.status).toBe("UPLOADED");
    const repeated = await Promise.all(
      Array.from({ length: 3 }, () => completeUpload(owner, upload.uploadSessionId, etag)),
    );
    for (const value of repeated) expect(value).toEqual(first);
    expect(storage.head).toHaveBeenCalledTimes(1);
    await expect(
      completeUpload(owner, upload.uploadSessionId, '"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"'),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("denies another owner before touching storage, including confirmed sessions", async () => {
    const { owner, upload } = await issue();
    const stranger = guest();
    await expect(completeUpload(stranger, upload.uploadSessionId, etag)).rejects.toMatchObject({
      status: 403,
    });
    expect(storage.head).not.toHaveBeenCalled();
    await completeUpload(owner, upload.uploadSessionId, etag);
    await expect(completeUpload(stranger, upload.uploadSessionId, etag)).rejects.toMatchObject({
      status: 403,
    });
  });
  it("rejects missing, expired and invalid storage objects without confirming", async () => {
    const { owner, upload } = await issue();
    await expect(completeUpload(owner, randomUUID(), etag)).rejects.toMatchObject({ status: 404 });
    for (const metadata of [
      null,
      { etag: "mismatch" },
      { etag, size: 1 },
      { etag, size: file.fileSizeBytes, mimeType: file.mimeType, encryption: "aws:kms" },
    ]) {
      storage.head.mockResolvedValueOnce(metadata);
      await expect(completeUpload(owner, upload.uploadSessionId, etag)).rejects.toMatchObject({
        status: 400,
      });
    }
    await db.imageUploadSession.update({
      where: { id: upload.uploadSessionId },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    await expect(completeUpload(owner, upload.uploadSessionId, etag)).rejects.toMatchObject({
      status: 410,
    });
    expect(
      (await db.imageUploadSession.findUniqueOrThrow({ where: { id: upload.uploadSessionId } }))
        .status,
    ).toBe("PENDING");
  });
  it("does not consume quota on signing failures and propagates storage outages", async () => {
    const owner = guest();
    storage.sign.mockRejectedValueOnce(new Error("storage unavailable"));
    await expect(createUpload(owner, file)).rejects.toThrow("storage unavailable");
    const { upload } = await issue(owner);
    storage.head.mockRejectedValueOnce(new Error("storage unavailable"));
    await expect(completeUpload(owner, upload.uploadSessionId, etag)).rejects.toThrow(
      "storage unavailable",
    );
  });
});
