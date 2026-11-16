import "server-only";
import { getPrisma } from "@/lib/prisma";
import { getKstDate } from "@/lib/dashboard/date";
import { snapshotView } from "./service";
import {
  calculateStreakDays,
  monthBounds,
  previousDate,
  type MonthlySnapshotData,
} from "./calendar";
export async function getMonthlySnapshots(
  userId: string,
  year: number,
  month: number,
  now = new Date(),
): Promise<MonthlySnapshotData> {
  const today = getKstDate(now);
  const { start, end } = monthBounds(year, month);
  const db = getPrisma();
  const rows = await db.dailySnapshot.findMany({
    where: { userId, recordDate: { gte: start, lt: end } },
    orderBy: { recordDate: "asc" },
  });
  // Stop as soon as a gap is found, while allowing a streak to cross month/year boundaries.
  const dates: string[] = [];
  let before = today;
  while (true) {
    const batch = await db.dailySnapshot.findMany({
      where: { userId, recordDate: { lte: new Date(`${before}T00:00:00Z`) } },
      orderBy: { recordDate: "desc" },
      take: 128,
      select: { recordDate: true },
    });
    if (!batch.length) break;
    dates.push(...batch.map((row) => row.recordDate.toISOString().slice(0, 10)));
    const streak = calculateStreakDays(dates, today);
    if (batch.length < 128 || streak !== dates.length) break;
    before = previousDate(dates[dates.length - 1]);
  }
  const snapshots = await Promise.all(
    rows.map(async (row) => {
      const { viewUrl, ...view } = await snapshotView(row);
      return { ...view, thumbnailUrl: viewUrl };
    }),
  );
  return {
    year,
    month,
    today,
    snapshots,
    totalRecordedDays: rows.length,
    todayRecorded: dates.includes(today),
    currentStreakDays: calculateStreakDays(dates, today),
    urlExpiresAt: new Date(now.getTime() + 300_000).toISOString(),
  };
}
