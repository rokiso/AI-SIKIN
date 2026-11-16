import { z } from "zod";
import { snapshotSchema } from "./types";
export const monthlyQuerySchema = z
  .object({
    year: z
      .string()
      .regex(/^\d{4}$/)
      .transform(Number)
      .pipe(z.number().int().min(1900).max(9998)),
    month: z
      .string()
      .regex(/^(?:0?[1-9]|1[0-2])$/)
      .transform(Number),
  })
  .strict();
export const monthlySnapshotSchema = snapshotSchema
  .omit({ viewUrl: true })
  .extend({ thumbnailUrl: z.url() });
export const monthlyResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    year: z.number().int(),
    month: z.number().int().min(1).max(12),
    today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    totalRecordedDays: z.number().int().nonnegative(),
    todayRecorded: z.boolean(),
    currentStreakDays: z.number().int().nonnegative(),
    urlExpiresAt: z.iso.datetime(),
    snapshots: z.array(monthlySnapshotSchema).max(31),
  }),
});
export type MonthlySnapshot = z.infer<typeof monthlySnapshotSchema>;
export type MonthlySnapshotData = z.infer<typeof monthlyResponseSchema>["data"];
export function monthBounds(year: number, month: number) {
  return { start: new Date(Date.UTC(year, month - 1, 1)), end: new Date(Date.UTC(year, month, 1)) };
}
export function previousDate(date: string) {
  return new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}
export function calculateStreakDays(dates: readonly string[], today: string) {
  const days = new Set(dates);
  let cursor = days.has(today) ? today : previousDate(today);
  let count = 0;
  while (days.has(cursor)) {
    count++;
    cursor = previousDate(cursor);
  }
  return count;
}
export function calendarCells(year: number, month: number) {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from({ length: Math.ceil((first + days) / 7) * 7 }, (_, i) =>
    i < first || i >= first + days
      ? null
      : `${year}-${String(month).padStart(2, "0")}-${String(i - first + 1).padStart(2, "0")}`,
  );
}
