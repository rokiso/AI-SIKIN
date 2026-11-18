import { randomBytes, randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { value: jar.get(name) } : undefined),
  }),
}));
import { GET } from "@/app/api/v1/diagnostics/progress/[sessionId]/route";
import { POST } from "@/app/api/v1/diagnostics/analyze/route";
import { getPrisma } from "@/lib/prisma";
import { getDatabaseUrl } from "@/lib/server-env";
import { assertLocalDevelopmentDatabase } from "@/lib/database-development";
import { createGuestSession } from "@/lib/session/guest-proof";
import { baumannQuestions } from "@/lib/diagnostic/baumannData";
const db = getPrisma();
const guests = new Set<string>();
const users = new Set<string>();
const cancels = new Set<() => Promise<unknown>>();
let guestId: string;
function identify() {
  const g = createGuestSession();
  guests.add(g.guestDeviceId);
  jar.set("x-guest-session-id", g.guestDeviceId);
  jar.set("sikin_guest_proof", g.proof);
  return g.guestDeviceId;
}
function session() {
  return db.diagnosticSession.create({
    data: {
      guestDeviceId: guestId,
      surveyAnswers: baumannQuestions.map((q) => ({ questionId: q.id, selectedChoice: 2 })),
      axisScores: {},
    },
  });
}
function get(id: string, signal?: AbortSignal) {
  return GET(new Request(`https://miruvia.test/api/v1/diagnostics/progress/${id}`, { signal }), {
    params: Promise.resolve({ sessionId: id }),
  });
}
async function analyze(id: string) {
  return POST(
    new Request("https://miruvia.test/api/v1/diagnostics/analyze", {
      method: "POST",
      headers: { origin: "https://miruvia.test", "content-type": "application/json" },
      body: JSON.stringify({ sessionId: id }),
    }),
  );
}
function read(response: Response) {
  const reader = response.body!.getReader();
  cancels.add(() => reader.cancel());
  const decoder = new TextDecoder();
  return {
    reader,
    async chunk() {
      const result = await reader.read();
      return result.done ? "" : decoder.decode(result.value);
    },
    async all() {
      let text = "";
      for (;;) {
        const result = await reader.read();
        if (result.done) return text;
        text += decoder.decode(result.value);
      }
    },
  };
}
beforeAll(() => assertLocalDevelopmentDatabase(getDatabaseUrl()));
beforeEach(() => {
  guestId = identify();
  vi.stubEnv("AI_LIVE_ENABLED", "0");
});
afterEach(async () => {
  await Promise.all([...cancels].map((cancel) => cancel()));
  cancels.clear();
  await db.diagnosticSession.deleteMany({
    where: { OR: [{ guestDeviceId: { in: [...guests] } }, { userId: { in: [...users] } }] },
  });
  await db.user.deleteMany({ where: { id: { in: [...users] } } });
  guests.clear();
  users.clear();
  jar.clear();
  vi.unstubAllEnvs();
});
afterAll(() => db.$disconnect());
describe("read-only authorized diagnostic SSE over real PostgreSQL", () => {
  it("rejects unverified headers, foreign sessions, missing sessions and malformed IDs before streaming", async () => {
    const s = await session();
    identify();
    expect((await get(s.id)).status).toBe(403);
    expect((await get(randomUUID())).status).toBe(404);
    expect((await get("bad-id")).status).toBe(400);
    jar.clear();
    expect(
      (
        await GET(
          new Request(`https://miruvia.test/api/v1/diagnostics/progress/${s.id}`, {
            headers: { "x-guest-session-id": guestId },
          }),
          { params: Promise.resolve({ sessionId: s.id }) },
        )
      ).status,
    ).toBe(401);
  });
  it("does not start analysis or create a report from GET and supports cancellation", async () => {
    const s = await session();
    const response = await get(s.id);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-transform");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    const stream = read(response);
    expect(await stream.chunk()).toContain(": connected");
    expect(await stream.chunk()).toContain(": keep-alive");
    expect((await db.diagnosticSession.findUniqueOrThrow({ where: { id: s.id } })).status).toBe(
      "SURVEY_COMPLETED",
    );
    expect(await db.diagnosticReport.count({ where: { sessionId: s.id } })).toBe(0);
    await stream.reader.cancel();
    expect(await stream.reader.read()).toMatchObject({ done: true });
  });
  it("streams actual ordered stages and the committed fallback report, then replays terminal state", async () => {
    const s = await session();
    const response = await get(s.id);
    const stream = read(response);
    await stream.chunk();
    await stream.chunk();
    const reading = stream.all();
    const analyzed = await (await analyze(s.id)).json();
    const text = await reading;
    const payloads = [...text.matchAll(/event: progress\ndata: (.+)\n/g)].map((match) =>
      JSON.parse(match[1]),
    );
    expect(payloads.map((p) => p.stepNumber)).toEqual([1, 2, 3]);
    expect(payloads[0].skipped).toBe(true);
    expect(text).toContain("event: fallback");
    expect(text).toContain('"reason":"QUESTIONNAIRE_ONLY"');
    expect(text).toContain(analyzed.data.reportId);
    const replay = read(await get(s.id));
    const replayText = await replay.all();
    expect(replayText).toContain(analyzed.data.reportId);
    expect(await db.diagnosticReport.count({ where: { sessionId: s.id } })).toBe(1);
  });
  it("streams a committed non-fallback report with the complete protocol", async () => {
    const s = await session();
    const report = await db.diagnosticReport.create({
      data: {
        sessionId: s.id,
        baumannType: "DRNT",
        oilinessScore: 33,
        sensitivityScore: 33,
        pigmentationScore: 33,
        elasticityScore: 33,
        summaryText: "테스트용 저장 리포트",
        recommendedIngredients: ["세라마이드"],
        cautionIngredients: [],
        aiAuditMetadata: { source: "AI_ASSISTED", isFallback: false },
      },
    });
    const stream = read(await get(s.id));
    const text = await stream.all();
    expect(text).toContain("event: complete");
    expect(text).toContain(report.id);
    expect(text).toContain('"isFallback":false');
    expect(text).not.toContain("event: fallback");
  });
  it("receives notifications from a separate database connection and isolates other sessions", async () => {
    const s = await session();
    const stream = read(await get(s.id));
    await stream.chunk();
    await stream.chunk();
    const publisher = new Client({ connectionString: getDatabaseUrl() });
    await publisher.connect();
    try {
      const progress = {
        step: "COMBINING_SURVEY",
        stepNumber: 2,
        progressPercent: 70,
        message: "다른 프로세스의 실제 단계",
        skipped: false,
      };
      await publisher.query("SELECT pg_notify($1,$2)", [
        "miruvia_diagnostic_progress",
        JSON.stringify({ sessionId: randomUUID(), progress }),
      ]);
      await publisher.query("SELECT pg_notify($1,$2)", [
        "miruvia_diagnostic_progress",
        JSON.stringify({ sessionId: s.id, progress }),
      ]);
      const text = await stream.chunk();
      expect(text).toContain("다른 프로세스의 실제 단계");
      expect(text).toContain("event: progress");
    } finally {
      await publisher.end();
    }
  });
  it("rechecks ownership after connection and never leaks a transferred report", async () => {
    const s = await session();
    const stream = read(await get(s.id));
    await stream.chunk();
    await stream.chunk();
    const user = await db.user.create({ data: { nickname: "동의된 별도 소유자" } });
    users.add(user.id);
    await db.diagnosticSession.update({ where: { id: s.id }, data: { userId: user.id } });
    const text = await stream.all();
    expect(text).toContain("event: error");
    expect(text).toContain("FORBIDDEN_REPORT_ACCESS");
    expect(text).not.toContain("event: complete");
  });
  it("accepts verified members, then ends on token revocation", async () => {
    const user = await db.user.create({ data: { nickname: "진행 상태 회원" } });
    users.add(user.id);
    const s = await session();
    await db.diagnosticSession.update({ where: { id: s.id }, data: { userId: user.id } });
    const token = randomBytes(32).toString("hex");
    await db.authSession.create({
      data: { userId: user.id, sessionToken: token, expiresAt: new Date(Date.now() + 60000) },
    });
    jar.set("app_session_token", token);
    const stream = read(await get(s.id));
    await stream.chunk();
    await stream.chunk();
    await db.authSession.deleteMany({ where: { userId: user.id } });
    const text = await stream.all();
    expect(text).toContain("FORBIDDEN_REPORT_ACCESS");
    expect(text).not.toContain(token);
  });
  it("releases the stream when the HTTP request is aborted", async () => {
    const s = await session();
    const abort = new AbortController();
    const stream = read(await get(s.id, abort.signal));
    await stream.chunk();
    await stream.chunk();
    abort.abort();
    expect(await stream.reader.read()).toMatchObject({ done: true });
  });
});
