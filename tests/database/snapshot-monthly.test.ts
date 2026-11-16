import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { value: jar.get(name) } : undefined),
  }),
}));
import { getPrisma } from "@/lib/prisma";
import { assertLocalDevelopmentDatabase } from "@/lib/database-development";
import { getDatabaseUrl } from "@/lib/server-env";
import { GET } from "@/app/api/v1/snapshots/monthly/route";
import { getMonthlySnapshots } from "@/lib/snapshot/monthly";
const db = getPrisma();
const users = new Set<string>();
beforeAll(() => assertLocalDevelopmentDatabase(getDatabaseUrl()));
beforeEach(() => {
  vi.stubEnv("S3_VAULT_BUCKET", "test-vault");
  vi.stubEnv("S3_VAULT_REGION", "ap-northeast-2");
  vi.stubEnv("AWS_ACCESS_KEY_ID", "test-key");
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", "test-secret");
  vi.stubEnv("S3_ENDPOINT", "");
});
afterEach(async () => {
  vi.restoreAllMocks();
  await db.user.deleteMany({ where: { id: { in: [...users] } } });
  users.clear();
  jar.clear();
  vi.unstubAllEnvs();
});
afterAll(() => db.$disconnect());
async function account() {
  const user = await db.user.create({ data: { nickname: "캘린더 검증" } });
  users.add(user.id);
  return user.id;
}
async function login(id: string, expired = false) {
  const token = randomBytes(32).toString("hex");
  await db.authSession.create({
    data: {
      userId: id,
      sessionToken: token,
      expiresAt: new Date(Date.now() + (expired ? -1000 : 60000)),
    },
  });
  jar.set("app_session_token", token);
}
function request(query = "year=2026&month=11") {
  return new Request(`https://miruvia.test/api/v1/snapshots/monthly?${query}`);
}
async function record(userId: string, date: string, ai = false) {
  return db.dailySnapshot.create({
    data: {
      userId,
      recordDate: new Date(`${date}T00:00:00Z`),
      s3Key: `daily-snapshots/snp-${randomUUID()}.jpg`,
      feedbackComment: ai ? "시험용 참고 피드백" : "일반 안내",
      feedbackSource: ai ? "AI" : "GENERAL_GUIDANCE",
      hydrationLevel: "LOW",
    },
  });
}
describe("private monthly snapshot projection", () => {
  it("requires live member credentials and never accepts identity headers", async () => {
    expect((await GET(request())).status).toBe(401);
    const id = await account();
    await login(id, true);
    expect((await GET(request())).status).toBe(401);
    jar.clear();
    expect(
      (
        await GET(
          new Request(request().url, {
            headers: { userId: id, "x-guest-session-id": randomUUID() },
          }),
        )
      ).status,
    ).toBe(401);
    await login(id);
    await db.authSession.deleteMany({ where: { userId: id } });
    expect((await GET(request())).status).toBe(401);
  });
  it("returns only owned month records and real 300-second SDK signatures without keys", async () => {
    const id = await account();
    const other = await account();
    await login(id);
    await record(id, "2026-10-31");
    await record(id, "2026-11-01", true);
    await record(id, "2026-11-02");
    await record(id, "2026-12-01");
    await record(other, "2026-11-03");
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = await response.json();
    expect(body.data.totalRecordedDays).toBe(2);
    expect(body.data.snapshots.map((item: { recordDate: string }) => item.recordDate)).toEqual([
      "2026-11-01",
      "2026-11-02",
    ]);
    for (const item of body.data.snapshots) {
      const url = new URL(item.thumbnailUrl);
      expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
      expect(url.searchParams.has("X-Amz-Signature")).toBe(true);
      expect(item.s3Key).toBeUndefined();
    }
    expect(body.data.snapshots[0].conditions.hydrationLevel).toBe("LOW");
    expect(body.data.snapshots[1].conditions).toBeNull();
    const projection = await getMonthlySnapshots(id, 2026, 11, new Date("2026-11-01T15:00:00Z"));
    expect(projection.today).toBe("2026-11-02");
    expect(projection.currentStreakDays).toBe(3);
  });
  it("rejects duplicate, foreign selectors and invalid dates, and returns honest empty data", async () => {
    const id = await account();
    await login(id);
    for (const query of [
      "year=2026&month=13",
      "year=2026&month=1&month=2",
      "year=2026",
      "year=2026&month=11&userId=victim",
    ])
      expect((await GET(request(query))).status).toBe(400);
    const response = await GET(request());
    expect((await response.json()).data).toMatchObject({
      snapshots: [],
      totalRecordedDays: 0,
      currentStreakDays: 0,
    });
  });
  it("counts streaks longer than one query batch without crossing a gap", async () => {
    const id = await account();
    const start = Date.parse("2026-11-02T00:00:00Z");
    await db.dailySnapshot.createMany({
      data: Array.from({ length: 130 }, (_, i) => ({
        userId: id,
        recordDate: new Date(start - i * 86400000),
        s3Key: `test/${randomUUID()}`,
        feedbackComment: "test",
      })),
    });
    expect(
      (await getMonthlySnapshots(id, 2026, 1, new Date("2026-11-02T03:00:00Z"))).currentStreakDays,
    ).toBe(130);
  });
  it("fails safely and limits repeated member requests", async () => {
    const id = await account();
    await login(id);
    const spy = vi
      .spyOn(db.dailySnapshot, "findMany")
      .mockRejectedValueOnce(new Error("private provider details"));
    const failure = await GET(request());
    expect(failure.status).toBe(503);
    expect(await failure.text()).not.toContain("private provider");
    spy.mockRestore();
    let last: Response | undefined;
    for (let i = 0; i < 60; i++) last = await GET(request());
    expect(last?.status).toBe(429);
    expect(last?.headers.get("retry-after")).toBe("60");
  });
});
