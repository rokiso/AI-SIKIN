import { randomUUID, randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const jar = vi.hoisted(() => new Map<string, string>());
const storage = vi.hoisted(() => vi.fn());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { value: jar.get(name) } : undefined),
  }),
}));
vi.mock("@/lib/storage/s3-vault", () => ({ deleteImageObjects: storage }));
import { DELETE, GET } from "../../app/api/v1/users/me/route";
import { deleteAccount } from "@/lib/account/deletion";
import { getPrisma } from "@/lib/prisma";
import { assertLocalDevelopmentDatabase } from "@/lib/database-development";
import { getDatabaseUrl } from "@/lib/server-env";
import { resolveRequestIdentity } from "@/lib/session/identity";
import { recordAiAuditLog } from "@/lib/ai/audit";
import { recordAffiliateRedirect } from "@/lib/catalog/curationService";
const db = getPrisma();
const users: string[] = [],
  logs: string[] = [],
  audits: string[] = [],
  clicks: string[] = [],
  products: string[] = [];
beforeAll(() => assertLocalDevelopmentDatabase(getDatabaseUrl()));
beforeEach(() => vi.stubEnv("ACCOUNT_DELETION_ENABLED", "1"));
afterEach(async () => {
  vi.restoreAllMocks();
  storage.mockReset();
  jar.clear();
  await db.aiInferenceAuditLog.deleteMany({ where: { id: { in: logs } } });
  await db.deletionAuditLog.deleteMany({ where: { id: { in: audits } } });
  await db.affiliateClickLog.deleteMany({ where: { id: { in: clicks } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.product.deleteMany({ where: { id: { in: products } } });
  users.length = logs.length = audits.length = clicks.length = products.length = 0;
  vi.unstubAllEnvs();
});
afterAll(() => db.$disconnect());
const body = { confirmationPhrase: "탈퇴합니다", agreedToDataLoss: true };
const request = (
  data: unknown = body,
  origin = "https://sikin.test",
  headers: Record<string, string> = {},
) =>
  new Request("https://sikin.test/api/v1/users/me", {
    method: "DELETE",
    headers: { origin, "Content-Type": "application/json", ...headers },
    body: JSON.stringify(data),
  });
async function fixture() {
  const user = await db.user.create({
    data: {
      nickname: "삭제 검증",
      accounts: { create: { provider: "GOOGLE", providerAccountId: randomUUID() } },
    },
  });
  users.push(user.id);
  const other = await db.user.create({ data: { nickname: "보존 검증" } });
  users.push(other.id);
  const token = randomBytes(32).toString("hex");
  await db.authSession.create({
    data: { userId: user.id, sessionToken: token, expiresAt: new Date(Date.now() + 3600000) },
  });
  jar.set("app_session_token", token);
  const expired = new Date(Date.now() - 120000);
  const image = await db.imageUploadSession.create({
    data: {
      userId: user.id,
      s3Key: `raw-faces/${randomUUID()}.jpg`,
      mimeType: "image/jpeg",
      fileSizeBytes: 10240,
      expiresAt: expired,
    },
  });
  const up = await db.snapshotUploadSession.create({
    data: {
      id: randomUUID(),
      userId: user.id,
      s3Key: `daily-snapshots/${randomUUID()}.jpg`,
      mimeType: "image/jpeg",
      fileSizeBytes: 10240,
      recordDate: new Date("2026-11-19"),
      expiresAt: expired,
    },
  });
  const diagnostic = await db.diagnosticSession.create({
    data: {
      userId: user.id,
      uploadSessionId: image.id,
      surveyAnswers: {},
      axisScores: {},
      report: {
        create: {
          baumannType: "DSNT",
          oilinessScore: 20,
          sensitivityScore: 60,
          pigmentationScore: 20,
          elasticityScore: 20,
          summaryText: "테스트",
          aiAuditMetadata: {},
        },
      },
    },
    include: { report: true },
  });
  await db.dailySnapshot.create({
    data: {
      userId: user.id,
      s3Key: up.s3Key,
      recordDate: new Date("2026-11-19"),
      feedbackComment: "테스트",
    },
  });
  await db.userConsentHistory.create({
    data: { userId: user.id, termsVersion: "test-only", sensitiveAgreed: true },
  });
  const log = await db.aiInferenceAuditLog.create({
    data: {
      sessionId: diagnostic.id,
      provider: "OPENAI",
      modelName: "test",
      promptTemplateHash: "a".repeat(64),
      latencyMs: 1,
      status: "SUCCESS",
    },
  });
  logs.push(log.id);
  const product = await db.product.create({
    data: {
      brandName: "test",
      productName: "test",
      category: "CREAM",
      ingredients: [],
      suitableBaumannTypes: [],
      affiliateBaseUrl: "https://example.com",
      isActive: false,
    },
  });
  products.push(product.id);
  const click = await db.affiliateClickLog.create({
    data: {
      productId: product.id,
      userId: user.id,
      reportId: diagnostic.report!.id,
      targetUrl: "https://example.com",
      userAgent: "test",
    },
  });
  clicks.push(click.id);
  storage.mockResolvedValue(2);
  return { user, other, token, image, up, diagnostic };
}
async function captureAudit() {
  const a = await db.deletionAuditLog.findMany({ orderBy: { completedAt: "desc" }, take: 1 });
  if (a[0]) audits.push(a[0].id);
  return a[0];
}
describe("authenticated account erasure", () => {
  it("keeps a disabled rollout unavailable without erasing files or account data", async () => {
    const f = await fixture();
    vi.stubEnv("ACCOUNT_DELETION_ENABLED", "0");
    expect((await GET()).status).toBe(503);
    const response = await DELETE(request());
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("ACCOUNT_DELETION_UNAVAILABLE");
    await expect(deleteAccount(f.user.id, f.token)).rejects.toMatchObject({ status: 503 });
    expect(storage).not.toHaveBeenCalled();
    expect(await db.user.findUnique({ where: { id: f.user.id } })).not.toBeNull();
    expect(await db.imageUploadSession.findUnique({ where: { id: f.image.id } })).not.toBeNull();
  });
  it("deletes owned rows and orphan logs, preserves another user, revokes token and expires cookies", async () => {
    const f = await fixture();
    expect((await (await GET()).json()).data).toEqual({ diagnostics: 1, snapshots: 1 });
    const res = await DELETE(request(body, undefined, { "x-user-id": f.other.id }));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ deleted: true, deletedImagesCount: 2 });
    expect(storage.mock.calls[0][0].sort()).toEqual([f.image.s3Key, f.up.s3Key].sort());
    expect(await db.user.findUnique({ where: { id: f.user.id } })).toBeNull();
    expect(await db.user.findUnique({ where: { id: f.other.id } })).not.toBeNull();
    expect(
      await db.diagnosticReport.findUnique({ where: { sessionId: f.diagnostic.id } }),
    ).toBeNull();
    for (const count of [
      await db.userAccount.count({ where: { userId: f.user.id } }),
      await db.userConsentHistory.count({ where: { userId: f.user.id } }),
      await db.snapshotUploadSession.count({ where: { userId: f.user.id } }),
      await db.imageUploadSession.count({ where: { userId: f.user.id } }),
      await db.dailySnapshot.count({ where: { userId: f.user.id } }),
      await db.authSession.count({ where: { userId: f.user.id } }),
    ])
      expect(count).toBe(0);
    expect(await db.aiInferenceAuditLog.findUnique({ where: { id: logs[0] } })).toBeNull();
    expect(await db.affiliateClickLog.findUnique({ where: { id: clicks[0] } })).toBeNull();
    const audit = await captureAudit();
    expect(audit.userHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(audit)).not.toContain(f.user.id);
    expect(audit.deletedRecordsCount).toBeGreaterThan(8);
    for (const n of [
      "app_session_token",
      "x-guest-session-id",
      "sikin_guest_proof",
      "oauth_pkce_payload",
    ])
      expect(res.cookies.get(n)?.maxAge).toBe(0);
    expect((await resolveRequestIdentity({ sessionToken: f.token })).kind).toBe("anonymous");
    expect((await DELETE(request())).status).toBe(401);
    const late = await recordAiAuditLog({
      id: randomUUID(),
      sessionId: f.diagnostic.id,
      provider: "OPENAI",
      modelName: "test",
      promptTemplateHash: "a".repeat(64),
      latencyMs: 1,
      status: "SUCCESS",
    });
    logs.push(late);
    expect(
      (await db.aiInferenceAuditLog.findUniqueOrThrow({ where: { id: late } })).sessionId,
    ).toBeNull();
    await expect(
      recordAffiliateRedirect(
        { productId: products[0], tier: "PRIMARY" },
        {
          kind: "member",
          userId: f.user.id,
          nickname: "삭제 검증",
          role: "USER",
          guestDeviceId: null,
        },
        null,
      ),
    ).rejects.toMatchObject({ status: 401 });
  });
  it("rolls back all DB rows on storage failure and retries the same keys", async () => {
    const f = await fixture();
    storage.mockRejectedValueOnce(new Error("private-storage-error"));
    const res = await DELETE(request());
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("private-storage-error");
    expect(await db.user.findUnique({ where: { id: f.user.id } })).not.toBeNull();
    expect(res.cookies.get("app_session_token")).toBeUndefined();
    expect((await DELETE(request())).status).toBe(200);
    await captureAudit();
    expect(storage.mock.calls[0][0]).toEqual(storage.mock.calls[1][0]);
  });
  it("preserves DB ownership for retry if a DB operation fails after external deletion", async () => {
    const f = await fixture();
    // Cause an actual constraint failure after storage deletion, before transaction commit.
    await db.$executeRaw`ALTER TABLE deletion_audit_logs ADD CONSTRAINT deletion_test_failure CHECK (deleted_images_count < 0) NOT VALID`;
    try {
      expect((await DELETE(request())).status).toBe(503);
      expect(storage).toHaveBeenCalledOnce();
      expect(await db.user.findUnique({ where: { id: f.user.id } })).not.toBeNull();
      expect(
        await db.diagnosticSession.findUnique({ where: { id: f.diagnostic.id } }),
      ).not.toBeNull();
    } finally {
      await db.$executeRaw`ALTER TABLE deletion_audit_logs DROP CONSTRAINT IF EXISTS deletion_test_failure`;
    }
    expect((await DELETE(request())).status).toBe(200);
    await captureAudit();
  });
  it("blocks live upload URLs even for confirmed images", async () => {
    const f = await fixture();
    await db.imageUploadSession.update({
      where: { id: f.image.id },
      data: { expiresAt: new Date(Date.now() + 10000), status: "UPLOADED" },
    });
    const res = await DELETE(request());
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("UPLOAD_LINK_STILL_VALID");
    expect(storage).not.toHaveBeenCalled();
  });
  it("rejects anonymous, expired, cross-site and invalid confirmations before touching storage", async () => {
    const f = await fixture();
    expect((await DELETE(request({ ...body, userId: users[1] }))).status).toBe(400);
    expect((await DELETE(request({ ...body, agreedToDataLoss: false }))).status).toBe(400);
    expect((await DELETE(request({ ...body, confirmationPhrase: "탈퇴" }))).status).toBe(400);
    expect((await DELETE(request(body, "https://evil.test"))).status).toBe(403);
    jar.clear();
    expect((await DELETE(request())).status).toBe(401);
    expect((await GET()).status).toBe(401);
    jar.set("app_session_token", randomBytes(32).toString("hex"));
    expect((await DELETE(request())).status).toBe(401);
    jar.set("app_session_token", f.token);
    await db.authSession.updateMany({
      where: { userId: f.user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await DELETE(request())).status).toBe(401);
    expect(storage).not.toHaveBeenCalled();
  });
  it("blocks shared-object ownership conflicts", async () => {
    const f = await fixture();
    await db.dailySnapshot.create({
      data: {
        userId: f.other.id,
        s3Key: f.up.s3Key,
        recordDate: new Date("2026-11-19"),
        feedbackComment: "foreign",
      },
    });
    expect((await DELETE(request())).status).toBe(409);
    expect(storage).not.toHaveBeenCalled();
  });
  it("serializes concurrent requests into one successful deletion and one revoked session", async () => {
    const f = await fixture();
    const result = await Promise.allSettled([
      deleteAccount(f.user.id, f.token),
      deleteAccount(f.user.id, f.token),
    ]);
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(storage).toHaveBeenCalledOnce();
    await captureAudit();
  });
});
