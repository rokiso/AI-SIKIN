import "server-only";
import type { Prisma, SnapshotMilestoneReport } from "@/generated/prisma/client";
import type { MilestoneSummary } from "./milestone-types";
import { calculateStreak, milestoneComment } from "./milestone-calculation";

export function milestoneSummary(row: SnapshotMilestoneReport): MilestoneSummary {
  if (row.achievedStreakDays !== 3 && row.achievedStreakDays !== 7)
    throw new Error("Invalid milestone length");
  return {
    id: row.id,
    milestoneType: row.milestoneType,
    achievedStreakDays: row.achievedStreakDays,
    startDate: row.startDate.toISOString().slice(0, 10),
    achievedDate: row.achievedDate.toISOString().slice(0, 10),
    summaryComment: row.summaryComment,
    badges: [row.milestoneType],
  };
}
// Called inside the snapshot transaction/owner-day lock, never from a public mutation endpoint.
export async function evaluateSnapshotMilestone(
  tx: Prisma.TransactionClient,
  userId: string,
  achievedDate: Date,
) {
  const rows = await tx.dailySnapshot.findMany({
    where: { userId, recordDate: { lte: achievedDate } },
    orderBy: { recordDate: "desc" },
    take: 8,
  });
  const day = achievedDate.toISOString().slice(0, 10);
  if (rows[0]?.recordDate.getTime() !== achievedDate.getTime()) return null;
  const days = calculateStreak(
    rows.map((row) => row.recordDate.toISOString().slice(0, 10)),
    day,
  ).currentStreak;
  if (days !== 3 && days !== 7) return null;
  const start = rows[days - 1],
    current = rows[0];
  const milestoneType = days === 3 ? "STREAK_3_DAYS" : "STREAK_7_DAYS";
  const initial = start.feedbackSource === "AI",
    final = current.feedbackSource === "AI";
  const row = await tx.snapshotMilestoneReport.upsert({
    where: { uq_user_milestone_date: { userId, milestoneType, achievedDate } },
    update: {},
    create: {
      userId,
      milestoneType,
      achievedDate,
      achievedStreakDays: days,
      startDate: start.recordDate,
      startSnapshotId: start.id,
      achievedSnapshotId: current.id,
      summaryComment: milestoneComment(days, initial && final),
      initialHydration: initial ? start.hydrationLevel : null,
      currentHydration: final ? current.hydrationLevel : null,
      initialSoothing: initial ? start.soothingLevel : null,
      currentSoothing: final ? current.soothingLevel : null,
      initialSebum: initial ? start.sebumLevel : null,
      currentSebum: final ? current.sebumLevel : null,
    },
  });
  return milestoneSummary(row);
}
