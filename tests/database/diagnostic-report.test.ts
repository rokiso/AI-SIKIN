import { consentFixture } from "../fixtures/consent-data";
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  metadata: vi.fn(),
  view: vi.fn(),
  after: vi.fn(),
  audit: vi.fn(async () => "SAVED" as const),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (mocks.jar.has(name) ? { value: mocks.jar.get(name) } : undefined),
  }),
}));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/lib/storage/s3-vault", () => ({
  readImageMetadata: mocks.metadata,
  signImageView: mocks.view,
}));
vi.mock("@/lib/ai/audit", () => ({ startAiAuditWrite: mocks.audit }));
import { POST } from "@/app/api/v1/diagnostics/analyze/route";
import { GET } from "@/app/api/v1/diagnostics/reports/[reportId]/route";
import { GET as progressStream } from "@/app/api/v1/diagnostics/progress/[sessionId]/route";
import { getPrisma } from "@/lib/prisma";
import { assertLocalDevelopmentDatabase } from "@/lib/database-development";
import { getDatabaseUrl } from "@/lib/server-env";
import { createGuestSession } from "@/lib/session/guest-proof";
import { baumannQuestions } from "@/lib/diagnostic/baumannData";
const db = getPrisma();
let consents: Awaited<ReturnType<typeof consentFixture>>;
const guests = new Set<string>();
const users = new Set<string>();
const answers = baumannQuestions.map((q) => ({ questionId: q.id, selectedChoice: 2 }));
const etag = '"0123456789abcdef0123456789abcdef"';
let guestId: string;
const features = {
  extractedFeatures: {
    visualOilinessHint: "OILY",
    visualErythemaScore: 100,
    visualPigmentScore: 100,
    visualPoreWrinkleScore: 100,
    confidenceScore: 1,
  },
  clinicalImpressionSummary: "사진의 외관과 문진을 참고한 일상 관리 안내입니다.",
  recommendedActiveIngredients: ["판테놀"],
  cautionIngredients: ["향료"],
};
function guest() {
  const g = createGuestSession();
  guests.add(g.guestDeviceId);
  mocks.jar.set("x-guest-session-id", g.guestDeviceId);
  mocks.jar.set("sikin_guest_proof", g.proof);
  return g.guestDeviceId;
}
function request(body: unknown, headers = {}) {
  return new Request("https://miruvia.test/api/v1/diagnostics/analyze", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://miruvia.test", ...headers },
    body: JSON.stringify(body),
  });
}
async function createSession(photo = false) {
  if (photo) await consents.allowFor({ guestDeviceId: guestId });
  const upload = photo
    ? await db.imageUploadSession.create({
        data: {
          guestDeviceId: guestId,
          s3Key: `test-analysis/${randomUUID()}`,
          status: "UPLOADED",
          etag,
          mimeType: "image/jpeg",
          fileSizeBytes: 10240,
          expiresAt: new Date(Date.now() + 900000),
        },
      })
    : null;
  return db.diagnosticSession.create({
    data: {
      guestDeviceId: guestId,
      uploadSessionId: upload?.id,
      surveyAnswers: answers,
      axisScores: { oiliness: 100, sensitivity: 100, pigmentation: 100, elasticity: 100 },
    },
  });
}
async function analyze(id: string) {
  return POST(request({ sessionId: id }));
}
async function get(id: string) {
  return GET(new Request(`https://miruvia.test/api/v1/diagnostics/reports/${id}`), {
    params: Promise.resolve({ reportId: id }),
  });
}
function providerResponse(value: unknown = features) {
  return Response.json({
    status: "completed",
    output: [{ content: [{ type: "output_text", text: JSON.stringify(value) }] }],
    usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
  });
}
function mockProvider(
  handler: (signal: AbortSignal) => Promise<Response> = async () => providerResponse(),
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options: RequestInit) => {
      if (url.startsWith("https://vault.example.invalid/"))
        return new Response(new Uint8Array([255, 216, 255, 1]), {
          headers: { "content-type": "image/jpeg" },
        });
      return handler(options.signal!);
    }),
  );
}
beforeAll(async () => {
  assertLocalDevelopmentDatabase(getDatabaseUrl());
  consents = await consentFixture();
});
beforeEach(() => {
  guestId = guest();
  vi.stubEnv("AI_LIVE_ENABLED", "0");
  vi.stubEnv("AI_PROVIDER", "OPENAI");
  vi.stubEnv("AI_API_KEY", "unit-test-only-not-real");
  vi.stubEnv("AI_MODEL_NAME", "test-model");
  vi.stubEnv("AI_REQUEST_TIMEOUT_MS", "8000");
  vi.stubEnv("S3_ENDPOINT", "https://vault.example.invalid");
  mocks.metadata
    .mockReset()
    .mockResolvedValue({ etag, size: 10240, mimeType: "image/jpeg", encryption: "AES256" });
  mocks.view.mockReset().mockResolvedValue("https://vault.example.invalid/photo");
  mocks.after.mockClear();
  mocks.audit.mockClear();
});
afterEach(async () => {
  await db.diagnosticSession.deleteMany({
    where: { OR: [{ guestDeviceId: { in: [...guests] } }, { userId: { in: [...users] } }] },
  });
  await db.imageUploadSession.deleteMany({ where: { guestDeviceId: { in: [...guests] } } });
  await db.user.deleteMany({ where: { id: { in: [...users] } } });
  guests.clear();
  users.clear();
  mocks.jar.clear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
afterAll(async () => {
  await consents.cleanup();
  await db.$disconnect();
});
describe("local diagnostic orchestrator and protected report API", () => {
  it("recomputes immutable answers, atomically saves one report and replays the same projection", async () => {
    const session = await createSession();
    const first = await analyze(session.id);
    expect(first.status).toBe(200);
    const body = await first.json();
    expect(body.data).toMatchObject({
      status: "COMPLETED",
      sessionId: session.id,
      baumannType: "DRNT",
      axisScores: { oiliness: 33, sensitivity: 33, pigmentation: 33, elasticity: 33 },
      overallScore: null,
      isFallback: true,
      source: "QUESTIONNAIRE",
    });
    expect((await (await analyze(session.id)).json()).data).toEqual(body.data);
    expect((await (await get(body.data.reportId)).json()).data.reportId).toBe(body.data.reportId);
    expect(await db.diagnosticReport.count({ where: { sessionId: session.id } })).toBe(1);
    const saved = await db.diagnosticSession.findUniqueOrThrow({
      where: { id: session.id },
      include: { report: true },
    });
    expect(saved.status).toBe("COMPLETED");
    expect(saved.report?.aiAuditMetadata).toMatchObject({
      source: "QUESTIONNAIRE",
      reason: "AI_DISABLED",
    });
    expect(first.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.metadata).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
    await expect(
      db.diagnosticReport.update({
        where: { id: body.data.reportId },
        data: { summaryText: "overwrite" },
      }),
    ).rejects.toThrow();
  });
  it("rejects invalid input, cross-site requests, fake header identity and missing report", async () => {
    expect((await POST(request({ sessionId: "bad" }))).status).toBe(400);
    expect((await POST(request({ sessionId: randomUUID(), userId: randomUUID() }))).status).toBe(
      400,
    );
    expect(
      (await POST(request({ sessionId: randomUUID(), padding: "x".repeat(9000) }))).status,
    ).toBe(400);
    expect((await POST(request({}, { origin: "https://evil.test" }))).status).toBe(403);
    expect((await analyze(randomUUID())).status).toBe(404);
    expect((await get(randomUUID())).status).toBe(404);
    mocks.jar.clear();
    expect(
      (await POST(request({ sessionId: randomUUID() }, { "x-guest-session-id": guestId }))).status,
    ).toBe(401);
    expect((await get(randomUUID())).status).toBe(401);
  });
  it("isolates foreign guests and denies transferred member reports to the original guest", async () => {
    const session = await createSession();
    const result = await (await analyze(session.id)).json();
    const original = new Map(mocks.jar);
    guest();
    const forbidden = await analyze(session.id);
    expect(forbidden.status).toBe(403);
    expect((await forbidden.json()).error.code).toBe("FORBIDDEN_SESSION_ACCESS");
    expect((await get(result.data.reportId)).status).toBe(403);
    mocks.jar.clear();
    original.forEach((v, k) => mocks.jar.set(k, v));
    const user = await db.user.create({ data: { nickname: "리포트 소유권 검증" } });
    users.add(user.id);
    await db.diagnosticSession.update({ where: { id: session.id }, data: { userId: user.id } });
    expect((await get(result.data.reportId)).status).toBe(403);
    expect((await analyze(session.id)).status).toBe(403);
    const token = randomBytes(32).toString("hex");
    await db.authSession.create({
      data: { userId: user.id, sessionToken: token, expiresAt: new Date(Date.now() + 60000) },
    });
    mocks.jar.set("app_session_token", token);
    expect((await get(result.data.reportId)).status).toBe(200);
    const memberSession = await db.diagnosticSession.create({
      data: { userId: user.id, surveyAnswers: answers, axisScores: {} },
    });
    const memberReport = await analyze(memberSession.id);
    expect(memberReport.status).toBe(200);
    const { data } = await memberReport.json();
    expect(data).toMatchObject({ source: "QUESTIONNAIRE", isFallback: true });
    expect((await get(data.reportId)).status).toBe(200);
    await db.authSession.deleteMany({ where: { userId: user.id } });
    expect((await get(result.data.reportId)).status).toBe(403);
  });
  it("enforces three analyses per owner under concurrency while permitting completed replays", async () => {
    const sessions = await Promise.all(Array.from({ length: 4 }, () => createSession()));
    const responses = await Promise.all(sessions.map((s) => analyze(s.id)));
    expect(responses.map((r) => r.status).sort()).toEqual([200, 200, 200, 429]);
    const done = await responses.find((r) => r.status === 200)!.json();
    expect((await analyze(done.data.sessionId)).status).toBe(200);
    expect(
      await db.diagnosticReport.count({ where: { session: { guestDeviceId: guestId } } }),
    ).toBe(3);
  });
  it("handles simultaneous requests without duplicate reports", async () => {
    const s = await createSession();
    const results = await Promise.all([analyze(s.id), analyze(s.id)]);
    expect(results.every((r) => [200, 202].includes(r.status))).toBe(true);
    const a = await (await analyze(s.id)).json();
    const b = await (await analyze(s.id)).json();
    expect(a.data.reportId).toBe(b.data.reportId);
    expect(await db.diagnosticReport.count({ where: { sessionId: s.id } })).toBe(1);
  });
  it("returns pending for a live claim and recovers an abandoned claim", async () => {
    const s = await createSession();
    await db.diagnosticSession.update({
      where: { id: s.id },
      data: { status: "ANALYSIS_PENDING" },
    });
    expect((await analyze(s.id)).status).toBe(202);
    await db.diagnosticSession.update({
      where: { id: s.id },
      data: { updatedAt: new Date(Date.now() - 31000) },
    });
    expect((await (await analyze(s.id)).json()).data.status).toBe("COMPLETED");
  });
  it("combines real gateway output at 60/40 and retains metadata without photo URLs", async () => {
    vi.stubEnv("AI_LIVE_ENABLED", "1");
    mockProvider();
    const s = await createSession(true);
    const body = await (await analyze(s.id)).json();
    expect(body.data).toMatchObject({
      baumannType: "OSPW",
      source: "AI_ASSISTED",
      isFallback: false,
      axisScores: { oiliness: 60, sensitivity: 60, pigmentation: 60, elasticity: 60 },
    });
    const row = await db.diagnosticReport.findUniqueOrThrow({ where: { sessionId: s.id } });
    expect(row.aiAuditMetadata).toMatchObject({ visualWeight: 0.4, auditStatus: "PENDING" });
    expect(JSON.stringify(row)).not.toContain("https://");
    expect(mocks.after).toHaveBeenCalledOnce();
  });
  it.each(["malformed", "unsafe", "zero-confidence", "missing-config"])(
    "falls back visibly for %s AI responses",
    async (mode) => {
      vi.stubEnv("AI_LIVE_ENABLED", "1");
      if (mode === "missing-config") vi.stubEnv("AI_API_KEY", "");
      mockProvider(async () =>
        providerResponse(
          mode === "malformed"
            ? {}
            : mode === "unsafe"
              ? { ...features, clinicalImpressionSummary: "여드름 치료" }
              : mode === "zero-confidence"
                ? {
                    ...features,
                    extractedFeatures: { ...features.extractedFeatures, confidenceScore: 0 },
                  }
                : features,
        ),
      );
      const s = await createSession(true);
      const body = await (await analyze(s.id)).json();
      expect(body.data).toMatchObject({
        baumannType: "DRNT",
        source: "QUESTIONNAIRE",
        isFallback: true,
      });
      expect(body.data.summary).not.toContain("치료");
      if (mode === "malformed") {
        const stored = await db.diagnosticReport.findUniqueOrThrow({ where: { sessionId: s.id } });
        expect(stored).toMatchObject({ isFallback: true, fallbackReason: "PARSE_ERROR" });
      }
    },
  );
  it.each([500, 502, 503, 504])("stores the fallback after one upstream %i", async (status) => {
    vi.stubEnv("AI_LIVE_ENABLED", "1");
    const provider = vi.fn(async () => new Response(null, { status }));
    mockProvider(provider);
    const session = await createSession(true);
    const response = await analyze(session.id);
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data).toMatchObject({
      baumannType: "DRNT",
      isFallback: true,
      fallbackNotice: expect.stringContaining("12문항"),
    });
    expect(provider).toHaveBeenCalledOnce();
    const stored = await db.diagnosticReport.findUniqueOrThrow({
      where: { sessionId: session.id },
    });
    expect(stored).toMatchObject({ isFallback: true, fallbackReason: "UPSTREAM_5XX" });
    expect((await (await get(data.reportId)).json()).data.fallbackNotice).toBe(data.fallbackNotice);
  });
  it("rejects incomplete survey data before attempting photo analysis", async () => {
    const session = await db.diagnosticSession.create({
      data: { guestDeviceId: guestId, surveyAnswers: answers.slice(0, 11), axisScores: {} },
    });
    const response = await analyze(session.id);
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INCOMPLETE_SURVEY_DATA");
    expect(await db.diagnosticReport.count({ where: { sessionId: session.id } })).toBe(0);
    expect(mocks.metadata).not.toHaveBeenCalled();
  });
  it("never sends an overwritten or unverified photo to a provider", async () => {
    vi.stubEnv("AI_LIVE_ENABLED", "1");
    mockProvider();
    mocks.metadata.mockResolvedValue({
      etag: '"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"',
      size: 10240,
      mimeType: "image/jpeg",
      encryption: "AES256",
    });
    const s = await createSession(true);
    const body = await (await analyze(s.id)).json();
    expect(body.data.isFallback).toBe(true);
    expect(mocks.view).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("fences a late worker after claim recovery and returns the single recovered report", async () => {
    vi.stubEnv("AI_LIVE_ENABLED", "1");
    let release: () => void = () => {};
    let calls = 0;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    mockProvider(async () => {
      if (++calls === 1) await waiting;
      return providerResponse();
    });
    const session = await createSession(true);
    const first = analyze(session.id);
    try {
      await vi.waitFor(() => expect(calls).toBe(1));
      await db.diagnosticSession.update({
        where: { id: session.id },
        data: { updatedAt: new Date(Date.now() - 31000) },
      });
      const recovered = await (await analyze(session.id)).json();
      release();
      const late = await (await first).json();
      expect(late.data.reportId).toBe(recovered.data.reportId);
      expect(await db.diagnosticReport.count({ where: { sessionId: session.id } })).toBe(1);
    } finally {
      release();
      await first;
    }
  });
  it("rechecks ownership after inference before committing a report", async () => {
    vi.stubEnv("AI_LIVE_ENABLED", "1");
    let release: () => void = () => {};
    let started = false;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    mockProvider(async () => {
      started = true;
      await waiting;
      return providerResponse();
    });
    const session = await createSession(true);
    const first = analyze(session.id);
    try {
      await vi.waitFor(() => expect(started).toBe(true));
      const user = await db.user.create({ data: { nickname: "이동된 리포트 소유자" } });
      users.add(user.id);
      await db.diagnosticSession.update({ where: { id: session.id }, data: { userId: user.id } });
      release();
      expect((await first).status).toBe(403);
      expect(await db.diagnosticReport.count({ where: { sessionId: session.id } })).toBe(0);
    } finally {
      release();
      await first;
    }
  });
  it("aborts a nine-second provider at eight seconds and commits the questionnaire report", async () => {
    vi.stubEnv("AI_LIVE_ENABLED", "1");
    let signal: AbortSignal | undefined;
    mockProvider((s) => {
      signal = s;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve(providerResponse()), 9000);
        s.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(new DOMException("Aborted", "AbortError"));
          },
          { once: true },
        );
      });
    });
    const s = await createSession(true);
    const stream = await progressStream(
      new Request(`https://miruvia.test/api/v1/diagnostics/progress/${s.id}`),
      { params: Promise.resolve({ sessionId: s.id }) },
    );
    const reader = stream.body!.getReader();
    const decoder = new TextDecoder();
    await reader.read();
    await reader.read();
    const reading = (async () => {
      let text = "";
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) return text;
        text += decoder.decode(chunk.value);
      }
    })();
    try {
      const started = performance.now();
      const response = await analyze(s.id);
      const elapsed = performance.now() - started;
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.data).toMatchObject({ source: "QUESTIONNAIRE", isFallback: true });
      expect(signal?.aborted).toBe(true);
      expect(elapsed).toBeGreaterThan(7900);
      expect(elapsed).toBeLessThan(10000);
      const report = await db.diagnosticReport.findUniqueOrThrow({ where: { sessionId: s.id } });
      expect(report).toMatchObject({ isFallback: true, fallbackReason: "TIMEOUT_EXCEEDED" });
      expect(report.aiAuditMetadata).toMatchObject({ reason: "AI_GATEWAY_TIMEOUT" });
      const text = await reading;
      expect(text).toContain("event: fallback");
      expect(text).toContain('"reason":"TIMEOUT"');
      expect(text).toContain(body.data.reportId);
      expect(performance.now() - started).toBeLessThan(10000);
    } finally {
      await reader.cancel();
    }
  }, 12000);
});
