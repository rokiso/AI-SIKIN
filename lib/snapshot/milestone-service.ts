import "server-only";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { getKstDate } from "@/lib/dashboard/date";
import { AuthError } from "@/lib/auth/response";
import { signImageView } from "@/lib/storage/s3-vault";
import { milestoneSummary } from "./milestone-issuance";
import { isSnapshotMilestonesEnabled } from "@/lib/server-env";
import { calculateStreak, compareCondition } from "./milestone-calculation";
import type { MilestoneDetail, StreakData } from "./milestone-types";

export function requireMilestonesEnabled() {
  if (!isSnapshotMilestonesEnabled())
    throw new AuthError(503, "MILESTONES_PREPARING", "연속 기록 리포트를 준비하고 있습니다.");
}
export async function getSnapshotStreak(userId: string, now = new Date()): Promise<StreakData> {
  requireMilestonesEnabled();
  const today = getKstDate(now),
    db = getPrisma();
  const [dates, latest] = await Promise.all([
    db.dailySnapshot.findMany({
      where: { userId, recordDate: { lte: new Date(`${today}T00:00:00Z`) } },
      select: { recordDate: true },
    }),
    db.snapshotMilestoneReport.findFirst({
      where: { userId, achievedDate: { lte: new Date(`${today}T00:00:00Z`) } },
      orderBy: [{ achievedDate: "desc" }, { id: "desc" }],
    }),
  ]);
  return {
    ...calculateStreak(
      dates.map((r) => r.recordDate.toISOString().slice(0, 10)),
      today,
    ),
    latestMilestoneReport: latest ? milestoneSummary(latest) : null,
  };
}
const invalidQuery = () =>
  new AuthError(400, "INVALID_MILESTONE_QUERY", "리포트 조회 요청을 확인해 주세요.");
export function milestoneQuery(request: Request, allowCursor = false) {
  const params = new URL(request.url).searchParams;
  if (params.has("userId"))
    throw new AuthError(403, "FORBIDDEN_SNAPSHOT", "다른 사용자의 기록을 조회할 수 없습니다.");
  if (
    [...params.keys()].some((key) => !allowCursor || key !== "cursor") ||
    params.getAll("cursor").length > 1
  )
    throw invalidQuery();
  const cursor = params.get("cursor");
  if (cursor !== null && !z.uuid().safeParse(cursor).success) throw invalidQuery();
  return cursor;
}
export async function listSnapshotMilestones(userId: string, cursor: string | null) {
  requireMilestonesEnabled();
  const db = getPrisma();
  const anchor = cursor
    ? await db.snapshotMilestoneReport.findFirst({ where: { id: cursor, userId } })
    : null;
  if (cursor && !anchor) throw invalidQuery();
  const rows = await db.snapshotMilestoneReport.findMany({
    where: {
      userId,
      ...(anchor
        ? {
            OR: [
              { achievedDate: { lt: anchor.achievedDate } },
              { achievedDate: anchor.achievedDate, id: { lt: anchor.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ achievedDate: "desc" }, { id: "desc" }],
    take: 21,
  });
  return {
    reports: rows.slice(0, 20).map(milestoneSummary),
    nextCursor: rows.length > 20 ? rows[19].id : null,
  };
}
export async function getSnapshotMilestone(userId: string, id: string): Promise<MilestoneDetail> {
  requireMilestonesEnabled();
  if (!z.uuid().safeParse(id).success) throw invalidQuery();
  const row = await getPrisma().snapshotMilestoneReport.findUnique({
    where: { id },
    include: { startSnapshot: true, achievedSnapshot: true },
  });
  if (!row) throw new AuthError(404, "MILESTONE_NOT_FOUND", "연속 기록 리포트를 찾을 수 없습니다.");
  if (
    row.userId !== userId ||
    row.startSnapshot.userId !== userId ||
    row.achievedSnapshot.userId !== userId
  )
    throw new AuthError(403, "FORBIDDEN_MILESTONE", "이 리포트를 조회할 권한이 없습니다.");
  // Only sign keys after checking the report and both referenced photo owners.
  const [startUrl, achievedUrl] = await Promise.all([
    signImageView(row.startSnapshot.s3Key),
    signImageView(row.achievedSnapshot.s3Key),
  ]);
  return {
    ...milestoneSummary(row),
    comparison: {
      hydration: compareCondition(row.initialHydration, row.currentHydration),
      soothing: compareCondition(row.initialSoothing, row.currentSoothing),
      sebum: compareCondition(row.initialSebum, row.currentSebum, true),
    },
    snapshots: {
      start: {
        id: row.startSnapshotId,
        recordDate: row.startDate.toISOString().slice(0, 10),
        viewUrl: startUrl,
      },
      achieved: {
        id: row.achievedSnapshotId,
        recordDate: row.achievedDate.toISOString().slice(0, 10),
        viewUrl: achievedUrl,
      },
    },
  };
}
