import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { value: jar.get(name) } : undefined),
  }),
}));
import { POST } from "@/app/api/v1/diagnostics/survey-answers/route";
import { saveSurvey } from "@/lib/diagnostic/survey-session";
import { baumannQuestions } from "@/lib/diagnostic/baumannData";
import { getPrisma } from "@/lib/prisma";
import { getDatabaseUrl } from "@/lib/server-env";
import { assertLocalDevelopmentDatabase } from "@/lib/database-development";
import { createGuestSession } from "@/lib/session/guest-proof";
const db = getPrisma();
const guests = new Set<string>();
const users = new Set<string>();
const answers = baumannQuestions.map((q) => ({ questionId: q.id, selectedChoice: 2 }));
function guest() {
  const g = createGuestSession();
  guests.add(g.guestDeviceId);
  return g;
}
function request(body: unknown, headers = {}) {
  return new Request("https://miruvia.test/api/v1/diagnostics/survey-answers", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
beforeAll(() => assertLocalDevelopmentDatabase(getDatabaseUrl()));
beforeEach(() => {
  const g = guest();
  jar.set("x-guest-session-id", g.guestDeviceId);
  jar.set("sikin_guest_proof", g.proof);
});
afterEach(async () => {
  const where = { OR: [{ guestDeviceId: { in: [...guests] } }, { userId: { in: [...users] } }] };
  await db.diagnosticSession.deleteMany({ where });
  await db.imageUploadSession.deleteMany({ where });
  await db.user.deleteMany({ where: { id: { in: [...users] } } });
  guests.clear();
  users.clear();
  jar.clear();
});
afterAll(() => db.$disconnect());
describe("survey API with real local database", () => {
  it("creates private guest answers once and rejects overwriting an immutable submission", async () => {
    const requestId = randomUUID();
    const response = await POST(request({ answers, requestId }));
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = await response.json();
    expect(body.data).toMatchObject({
      preliminaryType: "DRNT",
      axisScores: { oiliness: 33, sensitivity: 33, pigmentation: 33, elasticity: 33 },
    });
    const row = await db.diagnosticSession.findUniqueOrThrow({
      where: { id: body.data.sessionId },
    });
    expect(row.guestDeviceId).toBe(jar.get("x-guest-session-id"));
    expect(row.surveyAnswers).toEqual(answers);
    expect((await POST(request({ answers, requestId }))).status).toBe(201);
    expect(await db.diagnosticSession.count({ where: { id: requestId } })).toBe(1);
    expect(
      (
        await POST(
          request({ answers: answers.map((a) => ({ ...a, selectedChoice: 4 })), requestId }),
        )
      ).status,
    ).toBe(409);
  });
  it("rejects invalid bodies, foreign origins, unverified IDs and forged ownership", async () => {
    expect((await POST(request({ answers: answers.slice(1) }))).status).toBe(400);
    expect((await POST(request({ answers: [...answers.slice(1), answers[1]] }))).status).toBe(400);
    expect((await POST(request({ answers, userId: randomUUID() }))).status).toBe(400);
    expect((await POST(request({ answers }, { origin: "https://evil.test" }))).status).toBe(403);
    expect((await POST(request({ answers, padding: "x".repeat(5000) }))).status).toBe(400);
    jar.clear();
    expect((await POST(request({ answers }, { "x-guest-session-id": randomUUID() }))).status).toBe(
      401,
    );
  });
  it("binds a verified member, rejects revoked tokens, and checks photo ownership and completion", async () => {
    const user = await db.user.create({ data: { nickname: "문진 검증" } });
    users.add(user.id);
    const token = randomBytes(32).toString("hex");
    await db.authSession.create({
      data: { userId: user.id, sessionToken: token, expiresAt: new Date(Date.now() + 60000) },
    });
    jar.set("app_session_token", token);
    const first = await POST(request({ answers }));
    const body = await first.json();
    expect(
      (await db.diagnosticSession.findUniqueOrThrow({ where: { id: body.data.sessionId } })).userId,
    ).toBe(user.id);
    const other = guest();
    const upload = await db.imageUploadSession.create({
      data: {
        s3Key: `test/${randomUUID()}`,
        guestDeviceId: other.guestDeviceId,
        mimeType: "image/jpeg",
        fileSizeBytes: 10240,
        expiresAt: new Date(Date.now() + 60000),
        status: "UPLOADED",
      },
    });
    expect((await POST(request({ answers, uploadSessionId: upload.id }))).status).toBe(403);
    await db.imageUploadSession.update({
      where: { id: upload.id },
      data: { userId: user.id, guestDeviceId: null, status: "PENDING" },
    });
    expect((await POST(request({ answers, uploadSessionId: upload.id }))).status).toBe(403);
    await db.imageUploadSession.update({ where: { id: upload.id }, data: { status: "UPLOADED" } });
    expect((await POST(request({ answers, uploadSessionId: upload.id }))).status).toBe(201);
    await db.authSession.deleteMany({ where: { userId: user.id } });
    jar.delete("sikin_guest_proof");
    expect((await POST(request({ answers }))).status).toBe(401);
  });
  it("enforces the per-minute limit across concurrent submissions", async () => {
    const id = jar.get("x-guest-session-id")!;
    await db.diagnosticSession.createMany({
      data: Array.from({ length: 29 }, () => ({
        guestDeviceId: id,
        surveyAnswers: answers,
        axisScores: {},
      })),
    });
    const results = await Promise.allSettled([
      saveSurvey({ kind: "guest", guestDeviceId: id }, { answers }),
      saveSurvey({ kind: "guest", guestDeviceId: id }, { answers }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected").map((r) => r.reason)).toEqual([
      expect.objectContaining({ status: 429 }),
    ]);
  });
});
