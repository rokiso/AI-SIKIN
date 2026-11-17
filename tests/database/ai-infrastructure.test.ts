// @vitest-environment node
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const jar = vi.hoisted(() => new Map<string, string>());
const deferred = vi.hoisted(() => [] as Array<() => Promise<void>>);
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { value: jar.get(name)! } : undefined),
  }),
}));
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: (callback: () => Promise<void>) => deferred.push(callback),
}));
import { POST } from "../../app/api/v1/diagnostics/ai-healthcheck/route";
import { getPrisma } from "../../lib/prisma";
import { getDatabaseUrl } from "../../lib/server-env";
import { assertLocalDevelopmentDatabase } from "../../lib/database-development";
import { recordAiAuditLog, startAiAuditWrite } from "../../lib/ai/audit";

const prisma = getPrisma();
const users: string[] = [];
const auditIds: string[] = [];
const systemToken = "system-test-only-token-32-characters-minimum";
const features = {
  extractedFeatures: {
    visualOilinessHint: "NORMAL",
    visualErythemaScore: 20,
    visualPigmentScore: 30,
    visualPoreWrinkleScore: 40,
    confidenceScore: 0.4,
  },
  clinicalImpressionSummary: "측정값이 아닌 사진 외관 참고입니다.",
  recommendedActiveIngredients: ["판테놀"],
  cautionIngredients: [],
};
function request(body: unknown = {}, extraHeaders: Record<string, string> = {}) {
  return new Request("http://localhost/api/v1/diagnostics/ai-healthcheck", {
    method: "POST",
    headers: { origin: "http://localhost", "content-type": "application/json", ...extraHeaders },
    body: JSON.stringify(body),
  });
}
async function member(role: "ADMIN" | "USER" = "ADMIN") {
  const user = await prisma.user.create({ data: { nickname: "AI 기반 검증 회원", role } });
  users.push(user.id);
  const token = randomBytes(32).toString("hex");
  await prisma.authSession.create({
    data: { userId: user.id, sessionToken: token, expiresAt: new Date(Date.now() + 60_000) },
  });
  jar.set("app_session_token", token);
  return user;
}
async function result(response: Response) {
  const body = await response.json();
  const auditId: unknown = body.data?.auditLogId ?? body.auditLogId;
  if (typeof auditId === "string") auditIds.push(auditId);
  await Promise.all(deferred.splice(0).map((callback) => callback()));
  return body;
}
beforeAll(() => assertLocalDevelopmentDatabase(getDatabaseUrl()));
beforeEach(() => {
  jar.clear();
  vi.stubEnv("AI_PROVIDER", "OPENAI");
  vi.stubEnv("AI_API_KEY", "database-test-only-private-key");
  vi.stubEnv("AI_MODEL_NAME", "test-model");
  vi.stubEnv("AI_REQUEST_TIMEOUT_MS", "8000");
  vi.stubEnv("AI_LIVE_ENABLED", "0");
  vi.stubEnv("AI_HEALTHCHECK_TOKEN", systemToken);
});
afterEach(async () => {
  await Promise.all(deferred.splice(0).map((callback) => callback()));
  await prisma.aiInferenceAuditLog.deleteMany({ where: { id: { in: auditIds.splice(0) } } });
  await prisma.user.deleteMany({ where: { id: { in: users.splice(0) } } });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  jar.clear();
});
afterAll(() => prisma.$disconnect());

describe("private AI healthcheck and inference audit", () => {
  it("denies anonymous callers and a forged system token without contacting a provider", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect((await POST(request())).status).toBe(401);
    expect((await POST(request({}, { "x-system-healthcheck-token": "incorrect" }))).status).toBe(
      401,
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not grant localhost a development authorization bypass", async () => {
    vi.stubEnv("AI_HEALTHCHECK_TOKEN", "test-healthcheck-token");
    expect(
      (await POST(request({}, { "x-system-healthcheck-token": "test-healthcheck-token" }))).status,
    ).toBe(401);
  });
  it("denies an ordinary signed-in user and a revoked session", async () => {
    const user = await member("USER");
    expect((await POST(request())).status).toBe(403);
    await prisma.authSession.deleteMany({ where: { userId: user.id } });
    expect((await POST(request())).status).toBe(401);
  });
  it("requires same-origin admin requests even with a real database session", async () => {
    await member();
    expect((await POST(request({}, { origin: "https://other.invalid" }))).status).toBe(403);
  });
  it("defaults to dry-run and reveals no key or fake live success", async () => {
    await member();
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = await result(response);
    expect(body.data).toMatchObject({
      status: "CONFIGURED",
      dryRun: true,
      remoteChecked: false,
      liveEnabled: false,
      timeoutEnforcedMs: 8000,
    });
    expect(body.data.auditLogId).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("database-test-only-private-key");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("allows a strong system credential and rejects a cross-site system request", async () => {
    const headers = { "x-system-healthcheck-token": systemToken };
    expect((await POST(request({}, headers))).status).toBe(200);
    expect((await POST(request({}, { ...headers, "sec-fetch-site": "cross-site" }))).status).toBe(
      403,
    );
  });
  it("reports missing configuration safely instead of implying remote readiness", async () => {
    await member();
    vi.stubEnv("AI_API_KEY", "");
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect((await result(response)).error.code).toBe("AI_CONFIGURATION_UNAVAILABLE");
  });
  it("does not let dryRun:false enable paid requests", async () => {
    await member();
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const response = await POST(request({ dryRun: false }));
    expect(response.status).toBe(503);
    expect((await result(response)).error.code).toBe("AI_DISABLED");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects caller-controlled URLs, invalid image signatures and oversized JSON", async () => {
    await member();
    for (const body of [
      { imageUrl: "https://evil.invalid/photo" },
      { mockImageBase64: "data:image/png;base64,/9j/" },
      { mockImageBase64: "x".repeat(9000) },
    ])
      expect((await POST(request(body))).status).toBe(400);
  });
  it("enforces ten checks per minute for the verified principal", async () => {
    await member();
    for (let n = 0; n < 10; n++) expect((await POST(request())).status).toBe(200);
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect((await result(response)).error.code).toBe("AI_RATE_LIMIT_EXCEEDED");
  });
  it("persists successful inference metadata but never images, prompts or secrets", async () => {
    await member();
    vi.stubEnv("AI_LIVE_ENABLED", "1");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          status: "completed",
          output: [{ content: [{ type: "output_text", text: JSON.stringify(features) }] }],
          usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
        }),
      ),
    );
    const response = await POST(request({ dryRun: false }));
    expect(response.status).toBe(200);
    const body = await result(response);
    expect(body.data).toMatchObject({
      status: "HEALTHY",
      remoteChecked: true,
      auditStatus: "PENDING",
    });
    const row = await prisma.aiInferenceAuditLog.findUniqueOrThrow({
      where: { id: body.data.auditLogId },
    });
    expect(row).toMatchObject({
      provider: "OPENAI",
      modelName: "test-model",
      status: "SUCCESS",
      totalTokens: 30,
      sessionId: null,
      errorMessage: null,
    });
    expect(row.promptTemplateHash).toMatch(/^[a-f0-9]{64}$/);
    for (const privateValue of [
      "base64",
      "database-test-only-private-key",
      features.clinicalImpressionSummary,
    ]) {
      expect(JSON.stringify(row)).not.toContain(privateValue);
      expect(JSON.stringify(body)).not.toContain(privateValue);
    }
  });
  it("persists only a controlled error code on upstream failure", async () => {
    await member();
    vi.stubEnv("AI_LIVE_ENABLED", "1");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(Response.json({ error: "provider-private-debug-key" }, { status: 401 })),
    );
    const response = await POST(request({ dryRun: false }));
    expect(response.status).toBe(502);
    const body = await result(response);
    const row = await prisma.aiInferenceAuditLog.findUniqueOrThrow({
      where: { id: body.auditLogId },
    });
    expect(row).toMatchObject({
      status: "ERROR",
      errorMessage: "AI_PROVIDER_ERROR",
      totalTokens: null,
    });
    expect(JSON.stringify(body)).not.toContain("provider-private-debug-key");
    expect(JSON.stringify(row)).not.toContain("provider-private-debug-key");
  });
  it("records timeout and returns a safe 504 without waiting for a stalled provider", async () => {
    await member();
    vi.stubEnv("AI_LIVE_ENABLED", "1");
    vi.stubEnv("AI_REQUEST_TIMEOUT_MS", "20");
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    const response = await POST(request({ dryRun: false }));
    expect(response.status).toBe(504);
    const body = await result(response);
    expect(
      await prisma.aiInferenceAuditLog.findUniqueOrThrow({ where: { id: body.auditLogId } }),
    ).toMatchObject({ status: "TIMEOUT", errorMessage: "AI_GATEWAY_TIMEOUT" });
  });
  it("rejects arbitrary error text at the storage boundary and preserves database constraints", async () => {
    const data = {
      id: randomUUID(),
      provider: "OPENAI" as const,
      modelName: "test-model",
      promptTemplateHash: "a".repeat(64),
      latencyMs: 5,
      status: "ERROR" as const,
    };
    await expect(recordAiAuditLog({ ...data, latencyMs: -1 })).rejects.toThrow();
    await expect(
      prisma.aiInferenceAuditLog.create({
        data: { ...data, errorMessage: "private-provider-text" },
      }),
    ).rejects.toThrow();
    expect(await prisma.aiInferenceAuditLog.findUnique({ where: { id: data.id } })).toBeNull();
  });
  it("reports an audit write failure explicitly without converting provider success into stored-audit success", async () => {
    const logger = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(prisma.aiInferenceAuditLog, "create").mockRejectedValue(
      new Error("private-database-details"),
    );
    const status = await startAiAuditWrite({
      id: randomUUID(),
      provider: "OPENAI",
      modelName: "test-model",
      promptTemplateHash: "a".repeat(64),
      latencyMs: 5,
      status: "SUCCESS",
    });
    expect(status).toBe("FAILED");
    expect(logger).toHaveBeenCalled();
    expect(JSON.stringify(logger.mock.calls)).not.toContain("private-database-details");
  });
});
