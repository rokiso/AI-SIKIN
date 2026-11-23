import { randomUUID, randomBytes, createHmac } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  milestoneFailure: false,
  view: vi.fn(),
  head: vi.fn(),
  feedback: vi.fn(),
  erase: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (mocks.jar.has(name) ? { value: mocks.jar.get(name) } : undefined),
  }),
}));
vi.mock("@/lib/storage/s3-vault", () => ({
  signImageView: mocks.view,
  signImageUpload: async () => "https://snapshot-test.invalid/upload",
  readImageMetadata: mocks.head,
  deleteImageObjects: mocks.erase,
}));
vi.mock("@/lib/snapshot/feedback", () => ({ generateSnapshotFeedback: mocks.feedback }));
vi.mock("@/lib/snapshot/milestone-issuance", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/snapshot/milestone-issuance")>();
  return {
    ...actual,
    evaluateSnapshotMilestone: async (
      ...args: Parameters<typeof actual.evaluateSnapshotMilestone>
    ) => {
      if (mocks.milestoneFailure) throw new Error("milestone unavailable");
      return actual.evaluateSnapshotMilestone(...args);
    },
  };
});
import { getPrisma } from "@/lib/prisma";
import { assertLocalDevelopmentDatabase } from "@/lib/database-development";
import { getDatabaseUrl } from "@/lib/server-env";
import { getKstDate } from "@/lib/dashboard/date";
import { issueSnapshotUpload, recordSnapshot } from "@/lib/snapshot/service";
import {
  getSnapshotStreak,
  getSnapshotMilestone,
  listSnapshotMilestones,
} from "@/lib/snapshot/milestone-service";
import { deleteAccount } from "@/lib/account/deletion";
import { GET as streakRoute } from "@/app/api/v1/snapshots/streak/route";
import { GET as detailRoute } from "@/app/api/v1/snapshots/milestones/[milestoneId]/route";
import { GET as listRoute } from "@/app/api/v1/snapshots/milestones/route";
import { POST as recordRoute } from "@/app/api/v1/snapshots/route";
const db = getPrisma(),
  users: string[] = [],
  hashes: string[] = [];
const file = { mimeType: "image/jpeg" as const, fileSizeBytes: 10240 },
  etag = '"0123456789abcdef0123456789abcdef"';
const reference = new Date("2026-12-31T03:00:00Z");
function day(offset: number, now = reference) {
  return new Date(now.getTime() + offset * 86400000);
}
beforeAll(() => assertLocalDevelopmentDatabase(getDatabaseUrl()));
beforeEach(() => {
  vi.stubEnv("SNAPSHOT_MILESTONES_ENABLED", "1");
  mocks.milestoneFailure = false;
  mocks.view.mockResolvedValue("https://snapshot-test.invalid/view");
  mocks.head.mockResolvedValue({ etag, size: 10240, mimeType: "image/jpeg", encryption: "AES256" });
  mocks.feedback.mockResolvedValue({
    faceDetected: true,
    feedbackSource: "AI",
    feedbackComment: "사진 외관 참고 분류",
    conditions: { hydrationLevel: "BALANCED", soothingLevel: "HIGH", sebumLevel: "BALANCED" },
  });
  mocks.erase.mockImplementation(async (keys: string[]) => keys.length);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.deletionAuditLog.deleteMany({ where: { userHash: { in: hashes } } });
  users.length = hashes.length = 0;
  mocks.jar.clear();
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});
afterAll(() => db.$disconnect());
async function account() {
  const row = await db.user.create({ data: { nickname: "마일스톤 검증" } });
  users.push(row.id);
  return row.id;
}
async function login(userId: string) {
  const token = randomBytes(32).toString("hex");
  await db.authSession.create({
    data: { userId, sessionToken: token, expiresAt: new Date(Date.now() + 3600000) },
  });
  mocks.jar.set("app_session_token", token);
  return token;
}
async function seed(userId: string, offset: number, now = reference, ai = true) {
  return db.dailySnapshot.create({
    data: {
      userId,
      s3Key: `daily-snapshots/snp-${randomUUID()}.jpg`,
      recordDate: new Date(`${getKstDate(day(offset, now))}T00:00:00Z`),
      feedbackSource: ai ? "AI" : "GENERAL_GUIDANCE",
      feedbackComment: "테스트 기록",
      hydrationLevel: "LOW",
      soothingLevel: "BALANCED",
      sebumLevel: "HIGH",
    },
  });
}
async function receipt(userId: string, now = reference) {
  const upload = await issueSnapshotUpload(userId, file, now);
  return { s3Key: upload.s3Key, etag, idempotencyKey: randomUUID() };
}
const req = (path: string) => new Request(`https://sikin.test/api/v1/snapshots/${path}`);
const detail = (id: string) =>
  detailRoute(req(`milestones/${id}`), { params: Promise.resolve({ milestoneId: id }) });
it("atomically issues a three-day report and replays concurrent completion without duplicate or changed data", async () => {
  const user = await account();
  const first = await seed(user, -2);
  await seed(user, -1);
  const input = await receipt(user);
  const results = await Promise.all([
    recordSnapshot(user, input, reference),
    recordSnapshot(user, input, reference),
  ]);
  expect(results.map((r) => r.created).sort()).toEqual([false, true]);
  expect(results[0].milestone?.id).toBe(results[1].milestone?.id);
  expect(await db.snapshotMilestoneReport.count({ where: { userId: user } })).toBe(1);
  const id = results[0].milestone!.id;
  const comparison = await getSnapshotMilestone(user, id);
  expect(comparison).toMatchObject({
    achievedStreakDays: 3,
    startDate: getKstDate(day(-2)),
    comparison: {
      hydration: { initial: "LOW", current: "BALANCED", improved: true },
      sebum: { initial: "HIGH", current: "BALANCED", improved: true },
    },
    snapshots: { start: { id: first.id } },
  });
  expect((await recordSnapshot(user, input, day(1))).milestone?.id).toBe(id);
});
it("issues only day three and day seven of a run, with day one as both baselines", async () => {
  const user = await account();
  for (let i = 0; i < 8; i++) {
    const now = day(i),
      result = await recordSnapshot(user, await receipt(user, now), now);
    expect(result.milestone?.achievedStreakDays ?? null).toBe(i === 2 ? 3 : i === 6 ? 7 : null);
  }
  const rows = await db.snapshotMilestoneReport.findMany({
    where: { userId: user },
    orderBy: { achievedDate: "asc" },
  });
  expect(rows).toHaveLength(2);
  expect(rows[0].startSnapshotId).toBe(rows[1].startSnapshotId);
  expect(await getSnapshotStreak(user, day(8))).toMatchObject({
    currentStreak: 8,
    longestStreak: 8,
    todayRecorded: false,
    nextMilestone: null,
  });
});
it("does not fill in general guidance levels or claim an improvement", async () => {
  const user = await account();
  await seed(user, -2, reference, false);
  await seed(user, -1);
  const saved = await recordSnapshot(user, await receipt(user), reference);
  const report = await getSnapshotMilestone(user, saved.milestone!.id);
  expect(report.comparison.hydration).toEqual({
    initial: null,
    current: "BALANCED",
    improved: null,
  });
  expect(report.summaryComment).toContain("비교하지 않았어요");
});
it("resets across a gap and can issue a fresh three-day milestone after an earlier run", async () => {
  const user = await account();
  await seed(user, -4);
  await seed(user, -3);
  expect((await recordSnapshot(user, await receipt(user), reference)).milestone).toBeNull();
  for (const offset of [1, 2])
    await recordSnapshot(user, await receipt(user, day(offset)), day(offset));
  expect((await listSnapshotMilestones(user, null)).reports).toHaveLength(1);
});
it("rolls the snapshot and upload confirmation back if milestone evaluation fails", async () => {
  const user = await account();
  await seed(user, -2);
  await seed(user, -1);
  const input = await receipt(user);
  mocks.milestoneFailure = true;
  await expect(recordSnapshot(user, input, reference)).rejects.toThrow("milestone unavailable");
  expect(await db.dailySnapshot.count({ where: { userId: user } })).toBe(2);
  expect(
    (await db.snapshotUploadSession.findUniqueOrThrow({ where: { s3Key: input.s3Key } })).status,
  ).toBe("PENDING");
});
it("includes the earned report in the actual POST response and returns current streak without signing any photos", async () => {
  const user = await account();
  await login(user);
  const now = new Date();
  await seed(user, -2, now);
  await seed(user, -1, now);
  const input = await receipt(user, now);
  const r = await recordRoute(
    new Request("https://sikin.test/api/v1/snapshots", {
      method: "POST",
      headers: { origin: "https://sikin.test", "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
  expect(r.status).toBe(201);
  expect((await r.json()).data.milestone).toMatchObject({ achievedStreakDays: 3 });
  mocks.view.mockClear();
  const status = await streakRoute(req("streak"));
  expect(status.status).toBe(200);
  expect(status.headers.get("cache-control")).toBe("private, no-store");
  expect((await status.json()).data).toMatchObject({
    currentStreak: 3,
    longestStreak: 3,
    todayRecorded: true,
  });
  expect(mocks.view).not.toHaveBeenCalled();
});
it("rejects absent, guest and revoked sessions on all milestone APIs", async () => {
  const id = randomUUID();
  for (const token of [undefined, "guest-only-invalid-token"]) {
    if (token) mocks.jar.set("app_session_token", token);
    expect((await streakRoute(req("streak"))).status).toBe(401);
    expect((await listRoute(req("milestones"))).status).toBe(401);
    expect((await detail(id)).status).toBe(401);
  }
  const user = await account();
  await login(user);
  await db.authSession.deleteMany({ where: { userId: user } });
  expect((await detail(id)).status).toBe(401);
  expect(mocks.view).not.toHaveBeenCalled();
});
it("denies another report owner before signing and validates paths and owner selectors", async () => {
  const owner = await account(),
    other = await account();
  await seed(owner, -2);
  await seed(owner, -1);
  const saved = await recordSnapshot(owner, await receipt(owner), reference);
  await login(other);
  mocks.view.mockClear();
  expect((await detail(saved.milestone!.id)).status).toBe(403);
  expect(mocks.view).not.toHaveBeenCalled();
  expect((await detail(randomUUID())).status).toBe(404);
  expect((await detail("bad-id")).status).toBe(400);
  expect((await streakRoute(req("streak?userId=victim"))).status).toBe(403);
  expect((await streakRoute(req("streak?x=1"))).status).toBe(400);
  expect((await listRoute(req(`milestones?cursor=${saved.milestone!.id}`))).status).toBe(400);
  expect((await listRoute(req("milestones?cursor=bad"))).status).toBe(400);
  expect(
    (await listRoute(req(`milestones?cursor=${randomUUID()}&cursor=${randomUUID()}`))).status,
  ).toBe(400);
});
it("fails closed when either referenced photo belongs to another user", async () => {
  const owner = await account(),
    other = await account();
  await seed(owner, -2);
  await seed(owner, -1);
  const saved = await recordSnapshot(owner, await receipt(owner), reference);
  const foreign = await seed(other, -2);
  await db.snapshotMilestoneReport.update({
    where: { id: saved.milestone!.id },
    data: { startSnapshotId: foreign.id },
  });
  mocks.view.mockClear();
  await expect(getSnapshotMilestone(owner, saved.milestone!.id)).rejects.toMatchObject({
    status: 403,
  });
  expect(mocks.view).not.toHaveBeenCalled();
});
it("preserves the snapshot without touching milestone tables when production rollout is off", async () => {
  vi.stubEnv("SNAPSHOT_MILESTONES_ENABLED", undefined);
  vi.stubEnv("NODE_ENV", "production");
  const user = await account();
  await seed(user, -2);
  await seed(user, -1);
  const write = vi.spyOn(db.snapshotMilestoneReport, "upsert");
  const saved = await recordSnapshot(user, await receipt(user), reference);
  expect(saved.milestone).toBeNull();
  expect(write).not.toHaveBeenCalled();
  await login(user);
  expect((await streakRoute(req("streak"))).status).toBe(503);
});
it("cascades milestones on actual account deletion and preserves another member's report", async () => {
  vi.stubEnv("ACCOUNT_DELETION_ENABLED", "1");
  const secret = "milestone-test-only-cookie-secret-over32chars";
  vi.stubEnv("AUTH_COOKIE_SECRET", secret);
  const owner = await account(),
    other = await account();
  for (const user of [owner, other]) {
    await seed(user, -2);
    await seed(user, -1);
    await recordSnapshot(user, await receipt(user), reference);
  }
  await db.snapshotUploadSession.updateMany({
    where: { userId: owner },
    data: { expiresAt: new Date(Date.now() - 120000) },
  });
  const token = await login(owner);
  hashes.push(
    createHmac("sha256", secret).update(`miruvia:account-deletion:v1:${owner}`).digest("hex"),
  );
  await deleteAccount(owner, token);
  expect(await db.snapshotMilestoneReport.count({ where: { userId: owner } })).toBe(0);
  expect(await db.snapshotMilestoneReport.count({ where: { userId: other } })).toBe(1);
  expect((await streakRoute(req("streak"))).status).toBe(401);
});
it("paginates the owner's report history without duplicates or signed photo URLs", async () => {
  const user = await account();
  for (let run = 0; run < 21; run++) {
    await db.$transaction(async (tx) => {
      for (let offset = 0; offset < 3; offset++) {
        const date = new Date(Date.UTC(2025, 0, 1 + run * 4 + offset));
        await tx.dailySnapshot.create({
          data: {
            userId: user,
            s3Key: `daily-snapshots/snp-${randomUUID()}.jpg`,
            recordDate: date,
            feedbackComment: "로컬 기록",
          },
        });
        const { evaluateSnapshotMilestone } = await vi.importActual<
          typeof import("@/lib/snapshot/milestone-issuance")
        >("@/lib/snapshot/milestone-issuance");
        await evaluateSnapshotMilestone(tx, user, date);
      }
    });
  }
  await login(user);
  mocks.view.mockClear();
  const first = await listRoute(req("milestones"));
  expect(first.status).toBe(200);
  const page = (await first.json()).data;
  expect(page.reports).toHaveLength(20);
  expect(page.nextCursor).toBe(page.reports[19].id);
  const second = await listSnapshotMilestones(user, page.nextCursor);
  expect(second.reports).toHaveLength(1);
  expect(second.nextCursor).toBeNull();
  expect(new Set([...page.reports, ...second.reports].map((row) => row.id)).size).toBe(21);
  expect(mocks.view).not.toHaveBeenCalled();
});
it("serializes adjacent record dates while the earlier snapshot feedback is still pending", async () => {
  const user = await account();
  for (let offset = -5; offset < 0; offset++) await seed(user, offset);
  const input = await receipt(user),
    next = await receipt(user, day(1));
  let entered: () => void = () => {
      throw new Error("Uninitialized gate");
    },
    release: () => void = () => {
      throw new Error("Uninitialized gate");
    };
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const feedback = {
    faceDetected: true,
    feedbackSource: "AI",
    feedbackComment: "로컬 참고 분류",
    conditions: { hydrationLevel: "BALANCED", soothingLevel: "HIGH", sebumLevel: "BALANCED" },
  };
  mocks.feedback.mockImplementationOnce(async () => {
    entered();
    await gate;
    return feedback;
  });
  const earlier = recordSnapshot(user, input, reference);
  await ready;
  const later = recordSnapshot(user, next, day(1));
  try {
    await expect
      .poll(
        async () => {
          const rows = await db.$queryRaw<
            { waiting: boolean }[]
          >`SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted) AS waiting`;
          return rows[0].waiting;
        },
        { timeout: 2000, interval: 10 },
      )
      .toBe(true);
  } finally {
    release();
  }
  const results = await Promise.all([earlier, later]);
  expect(results[0].milestone).toBeNull();
  expect(results[1].milestone?.achievedStreakDays).toBe(7);
});
