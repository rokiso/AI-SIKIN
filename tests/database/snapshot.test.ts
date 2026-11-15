import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  sign: vi.fn(),
  head: vi.fn(),
  view: vi.fn(),
  jar: new Map<string, string>(),
}));
vi.mock("@/lib/storage/s3-vault", () => ({
  signImageUpload: mocks.sign,
  readImageMetadata: mocks.head,
  signImageView: mocks.view,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (mocks.jar.has(name) ? { value: mocks.jar.get(name) } : undefined),
  }),
}));
import { getPrisma } from "@/lib/prisma";
import { getDatabaseUrl } from "@/lib/server-env";
import { assertLocalDevelopmentDatabase } from "@/lib/database-development";
import { getKstDate } from "@/lib/dashboard/date";
import { getTodaySnapshot, issueSnapshotUpload, recordSnapshot } from "@/lib/snapshot/service";
import { POST as issueRoute } from "@/app/api/v1/snapshots/upload-url/route";
import { POST as recordRoute } from "@/app/api/v1/snapshots/route";
import { GET as todayRoute } from "@/app/api/v1/snapshots/today/route";
const db = getPrisma();
const users = new Set<string>();
const file = { mimeType: "image/jpeg" as const, fileSizeBytes: 10240 };
const etag = '"0123456789abcdef0123456789abcdef"';
beforeAll(() => assertLocalDevelopmentDatabase(getDatabaseUrl()));
beforeEach(() => {
  mocks.sign.mockResolvedValue("https://test-vault.invalid/signed");
  mocks.view.mockResolvedValue("https://test-vault.invalid/view");
  mocks.head.mockResolvedValue({
    etag,
    size: file.fileSizeBytes,
    mimeType: file.mimeType,
    encryption: "AES256",
  });
});
afterEach(async () => {
  await db.user.deleteMany({ where: { id: { in: [...users] } } });
  users.clear();
  mocks.jar.clear();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
afterAll(async () => db.$disconnect());
async function account() {
  const user = await db.user.create({ data: { nickname: "스냅샷 테스트" } });
  users.add(user.id);
  return user.id;
}
async function login(userId: string) {
  const token = randomBytes(32).toString("hex");
  await db.authSession.create({
    data: { userId, sessionToken: token, expiresAt: new Date(Date.now() + 3600000) },
  });
  mocks.jar.set("app_session_token", token);
}
function request(path: string, body?: unknown, origin = "https://sikin.test") {
  return new Request(`https://sikin.test${path}`, {
    ...(body === undefined
      ? {}
      : {
          method: "POST",
          headers: { origin, "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
}
async function receipt(userId: string, now = new Date()) {
  const issued = await issueSnapshotUpload(userId, file, now);
  return { s3Key: issued.s3Key, etag, idempotencyKey: randomUUID() };
}
describe("KST daily snapshot lifecycle", () => {
  it("records once with explicit unmeasured guidance and returns only the member's signed image", async () => {
    const userId = await account();
    expect(await getTodaySnapshot(userId)).toEqual({ recorded: false, snapshot: null });
    const input = await receipt(userId);
    expect(mocks.sign).toHaveBeenCalledWith(
      expect.stringMatching(/^daily-snapshots\/snp-/),
      file,
      300,
    );
    const saved = await recordSnapshot(userId, input);
    expect(saved.created).toBe(true);
    expect(saved.row.feedbackSource).toBe("GENERAL_GUIDANCE");
    const today = await getTodaySnapshot(userId);
    expect(today.recorded).toBe(true);
    expect(today.snapshot).toMatchObject({
      recordDate: getKstDate(),
      conditions: null,
      feedbackSource: "GENERAL_GUIDANCE",
      viewUrl: "https://test-vault.invalid/view",
    });
    expect(today.snapshot?.feedbackComment).toContain("판정하지 않았습니다");
    await expect(issueSnapshotUpload(userId, file)).rejects.toMatchObject({
      status: 409,
      code: "ALREADY_RECORDED_TODAY",
    });
    const other = await account();
    expect(await getTodaySnapshot(other)).toEqual({ recorded: false, snapshot: null });
  });
  it("is idempotent under concurrent completion and never updates the existing timestamp", async () => {
    const user = await account();
    const input = await receipt(user);
    const results = await Promise.all([recordSnapshot(user, input), recordSnapshot(user, input)]);
    expect(results.map((x) => x.created).sort()).toEqual([false, true]);
    expect(results[0].row.id).toBe(results[1].row.id);
    expect(results[0].row.updatedAt).toEqual(results[1].row.updatedAt);
    expect(mocks.head).toHaveBeenCalledTimes(1);
    await expect(
      recordSnapshot(user, { ...input, etag: '"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"' }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(
      recordSnapshot(user, { ...input, idempotencyKey: randomUUID() }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("rejects another member, absent objects and metadata mismatches before saving", async () => {
    const owner = await account();
    const other = await account();
    const input = await receipt(owner);
    await expect(recordSnapshot(other, input)).rejects.toMatchObject({ status: 403 });
    expect(mocks.head).not.toHaveBeenCalled();
    for (const metadata of [
      null,
      { etag: "wrong" },
      { etag, size: 999, mimeType: file.mimeType, encryption: "AES256" },
      { etag, size: file.fileSizeBytes, mimeType: file.mimeType, encryption: "aws:kms" },
    ]) {
      mocks.head.mockResolvedValueOnce(metadata);
      await expect(recordSnapshot(owner, input)).rejects.toMatchObject({ status: 400 });
    }
    expect(await db.dailySnapshot.count({ where: { userId: owner } })).toBe(0);
  });
  it("rejects provider-confirmed missing faces without persisting a record", async () => {
    const user = await account();
    const input = await receipt(user);
    vi.stubEnv("SNAPSHOT_AI_API_KEY", "test-only-key");
    vi.stubEnv("SNAPSHOT_AI_MODEL", "test-model");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({
            status: "completed",
            output: [
              {
                content: [
                  {
                    type: "output_text",
                    text: JSON.stringify({
                      faceDetected: false,
                      hydrationLevel: "BALANCED",
                      soothingLevel: "BALANCED",
                      sebumLevel: "BALANCED",
                      feedbackComment: "얼굴이 보이지 않습니다.",
                    }),
                  },
                ],
              },
            ],
          }),
        ),
    );
    await expect(recordSnapshot(user, input)).rejects.toMatchObject({
      status: 400,
      code: "FACE_NOT_DETECTED",
    });
    expect(await db.dailySnapshot.count({ where: { userId: user } })).toBe(0);
  });
  it("uses KST midnight and expires an old-day upload even inside its 300-second TTL", async () => {
    const user = await account();
    const before = new Date("2026-11-15T14:59:58Z");
    const after = new Date("2026-11-15T15:00:01Z");
    const input = await receipt(user, before);
    await expect(recordSnapshot(user, input, after)).rejects.toMatchObject({ status: 410 });
    const next = await receipt(user, after);
    const row = await recordSnapshot(user, next, after);
    expect(row.row.recordDate.toISOString()).toBe("2026-11-16T00:00:00.000Z");
    expect((await getTodaySnapshot(user, before)).recorded).toBe(false);
    expect((await getTodaySnapshot(user, after)).recorded).toBe(true);
  });
  it("limits URL issuance and propagates storage failures without recording success", async () => {
    const user = await account();
    for (let i = 0; i < 3; i++) await receipt(user);
    await expect(issueSnapshotUpload(user, file)).rejects.toMatchObject({ status: 429 });
    const other = await account();
    const input = await receipt(other);
    mocks.head.mockRejectedValueOnce(new Error("provider unavailable"));
    await expect(recordSnapshot(other, input)).rejects.toThrow("provider unavailable");
    expect(await db.dailySnapshot.count({ where: { userId: other } })).toBe(0);
  });
});
describe("snapshot API authorization", () => {
  it("denies anonymous calls and ignores user identity headers", async () => {
    expect((await todayRoute(request("/api/v1/snapshots/today"))).status).toBe(401);
    expect(
      (
        await issueRoute(
          new Request("https://sikin.test/api/v1/snapshots/upload-url", {
            method: "POST",
            headers: {
              origin: "https://sikin.test",
              "content-type": "application/json",
              "x-user-id": "victim",
            },
            body: JSON.stringify(file),
          }),
        )
      ).status,
    ).toBe(401);
    expect((await recordRoute(request("/api/v1/snapshots", {}))).status).toBe(401);
  });
  it("supports the full API contract, rejects resource selectors and blocks CSRF", async () => {
    const user = await account();
    await login(user);
    expect((await todayRoute(request("/api/v1/snapshots/today?userId=victim"))).status).toBe(403);
    expect(
      (await issueRoute(request("/api/v1/snapshots/upload-url", { ...file, userId: "victim" })))
        .status,
    ).toBe(403);
    expect(
      (await issueRoute(request("/api/v1/snapshots/upload-url", file, "https://evil.test"))).status,
    ).toBe(403);
    expect(
      (await issueRoute(request("/api/v1/snapshots/upload-url", { ...file, fileSizeBytes: 10239 })))
        .status,
    ).toBe(400);
    const issued = await issueRoute(request("/api/v1/snapshots/upload-url", file));
    expect(issued.status).toBe(201);
    const body = await issued.json();
    const input = { s3Key: body.data.s3Key, etag, idempotencyKey: randomUUID() };
    const saved = await recordRoute(request("/api/v1/snapshots", input));
    expect(saved.status).toBe(201);
    expect(saved.headers.get("cache-control")).toBe("private, no-store");
    expect((await recordRoute(request("/api/v1/snapshots", input))).status).toBe(200);
    expect((await issueRoute(request("/api/v1/snapshots/upload-url", file))).status).toBe(409);
    expect(await (await todayRoute(request("/api/v1/snapshots/today"))).json()).toMatchObject({
      success: true,
      data: { recorded: true, snapshot: { conditions: null, feedbackSource: "GENERAL_GUIDANCE" } },
    });
  });
});
