import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ jar: new Map<string, string>(), sign: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (state.jar.has(name) ? { value: state.jar.get(name) } : undefined),
  }),
}));
vi.mock("@/lib/storage/s3-vault", () => ({ signImageView: state.sign }));
import { getPrisma } from "@/lib/prisma";
import { assertLocalDevelopmentDatabase } from "@/lib/database-development";
import { getDatabaseUrl } from "@/lib/server-env";
import { createGuestSession } from "@/lib/session/guest-proof";
import { GET } from "@/app/api/v1/users/me/history/route";
const db = getPrisma();
const users = new Set<string>();
const sessions = new Set<string>();
beforeAll(() => assertLocalDevelopmentDatabase(getDatabaseUrl()));
beforeEach(() => {
  state.sign.mockImplementation(
    async (key: string) => `https://vault.invalid/${key}?X-Amz-Expires=300`,
  );
});
afterEach(async () => {
  vi.restoreAllMocks();
  await db.diagnosticSession.deleteMany({ where: { id: { in: [...sessions] } } });
  await db.user.deleteMany({ where: { id: { in: [...users] } } });
  users.clear();
  sessions.clear();
  state.jar.clear();
  state.sign.mockReset();
});
afterAll(() => db.$disconnect());
async function account() {
  const row = await db.user.create({ data: { nickname: "보관함 검증" } });
  users.add(row.id);
  return row.id;
}
async function login(userId: string) {
  const token = randomBytes(32).toString("hex");
  await db.authSession.create({
    data: { userId, sessionToken: token, expiresAt: new Date(Date.now() + 60000) },
  });
  state.jar.set("app_session_token", token);
}
async function report(
  owner: { userId?: string; guestDeviceId?: string },
  createdAt = new Date(),
  completed = true,
) {
  const row = await db.diagnosticSession.create({
    data: {
      ...owner,
      status: completed ? "COMPLETED" : "SURVEY_COMPLETED",
      surveyAnswers: [],
      axisScores: {},
      report: {
        create: {
          baumannType: "DSNT",
          oilinessScore: 20,
          sensitivityScore: 75,
          pigmentationScore: 30,
          elasticityScore: 40,
          summaryText: "보관함 테스트 결과",
          recommendedIngredients: ["판테놀"],
          cautionIngredients: ["향료"],
          aiAuditMetadata: {},
          createdAt,
        },
      },
    },
    include: { report: true },
  });
  sessions.add(row.id);
  return row.report!;
}
async function snapshot(userId: string, day: number) {
  return db.dailySnapshot.create({
    data: {
      userId,
      s3Key: `daily-snapshots/${randomUUID()}.jpg`,
      recordDate: new Date(`2026-11-${String(day).padStart(2, "0")}T00:00:00Z`),
      feedbackComment: "일반 보습 안내",
      feedbackSource: "GENERAL_GUIDANCE",
    },
  });
}
function request(query = "") {
  return new Request(`https://miruvia.test/api/v1/users/me/history${query ? "?" + query : ""}`);
}
describe("private mypage history projection", () => {
  it("filters members, incomplete reports and arbitrary user selectors", async () => {
    const owner = await account(),
      stranger = await account();
    await login(owner);
    const mine = await report({ userId: owner });
    await report({ userId: stranger });
    await report({ userId: owner }, new Date(), false);
    const ownPhoto = await snapshot(owner, 1);
    await snapshot(stranger, 2);
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const data = (await response.json()).data;
    expect(data.diagnostics.items.map((x: { reportId: string }) => x.reportId)).toEqual([mine.id]);
    expect(data.diagnostics.totalCount).toBe(1);
    expect(data.diagnostics.items[0].overallScore).toBeNull();
    expect(data.diagnostics.items[0].baumannNameKo).toContain("색소침착 고민 적음");
    expect(data.snapshots.items[0].snapshotId).toBe(ownPhoto.id);
    expect(data.snapshots.items[0].conditions).toBeNull();
    expect(data.snapshots.items[0].s3Key).toBeUndefined();
    expect(state.sign).toHaveBeenCalledTimes(1);
    expect((await GET(request(`userId=${stranger}`))).status).toBe(400);
  });
  it("uses signed guests only and returns no member-owned records or snapshots", async () => {
    const guest = createGuestSession();
    state.jar.set("x-guest-session-id", guest.guestDeviceId);
    state.jar.set("sikin_guest_proof", guest.proof);
    const mine = await report({ guestDeviceId: guest.guestDeviceId });
    await report({ guestDeviceId: randomUUID() });
    const member = await account();
    await report({ userId: member, guestDeviceId: guest.guestDeviceId });
    const data = (await (await GET(request())).json()).data;
    expect(data.diagnostics.items.map((x: { reportId: string }) => x.reportId)).toEqual([mine.id]);
    expect(data.user.isAuthenticated).toBe(false);
    expect(data.snapshots.items).toEqual([]);
    expect(state.sign).not.toHaveBeenCalled();
    state.jar.delete("sikin_guest_proof");
    expect((await GET(request())).status).toBe(401);
  });
  it("paginates tied reports without repeats and validates cursor ownership", async () => {
    const id = await account();
    await login(id);
    const timestamp = new Date("2026-11-01T01:00:00Z");
    const records = await Promise.all(
      Array.from({ length: 3 }, () => report({ userId: id }, timestamp)),
    );
    const first = (await (await GET(request("tab=diagnostics&limit=2"))).json()).data.diagnostics;
    const second = (
      await (await GET(request(`tab=diagnostics&limit=2&cursor=${first.nextCursor}`))).json()
    ).data.diagnostics;
    expect([...first.items, ...second.items].map((x) => x.reportId).sort()).toEqual(
      records.map((x) => x.id).sort(),
    );
    expect(second.nextCursor).toBeNull();
    const other = await report({ userId: await account() });
    expect((await GET(request(`tab=diagnostics&cursor=${other.id}`))).status).toBe(400);
    for (const q of [
      "limit=51",
      "limit=0",
      "limit=1.5",
      "tab=invalid",
      "tab=all&cursor=" + first.nextCursor,
      "limit=2&limit=3",
    ])
      expect((await GET(request(q))).status).toBe(400);
  });
  it("paginates snapshot dates, rejects foreign cursors and isolates storage failures to the selected tab", async () => {
    const id = await account();
    await login(id);
    await snapshot(id, 1);
    await snapshot(id, 2);
    const foreign = await snapshot(await account(), 3);
    const first = (await (await GET(request("tab=snapshots&limit=1"))).json()).data.snapshots;
    const second = (
      await (await GET(request(`tab=snapshots&limit=1&cursor=${first.nextCursor}`))).json()
    ).data.snapshots;
    expect(first.items[0].recordDate).toBe("2026-11-02");
    expect(second.items[0].recordDate).toBe("2026-11-01");
    expect((await GET(request(`tab=snapshots&cursor=${foreign.id}`))).status).toBe(400);
    state.sign.mockRejectedValue(new Error("private storage detail"));
    expect((await GET(request("tab=diagnostics"))).status).toBe(200);
    const failed = await GET(request("tab=snapshots"));
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain("private storage");
  });
  it("denies expired and revoked credentials and returns honest empty history", async () => {
    const id = await account();
    await login(id);
    expect((await (await GET(request())).json()).data.diagnostics).toMatchObject({
      totalCount: 0,
      items: [],
    });
    await db.authSession.updateMany({
      where: { userId: id },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    expect((await GET(request())).status).toBe(401);
    await login(id);
    await db.authSession.deleteMany({ where: { userId: id } });
    expect((await GET(request())).status).toBe(401);
  });
});
