import { z } from "zod";
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const milestoneType = z.enum(["STREAK_3_DAYS", "STREAK_7_DAYS"]);
export const conditionLevel = z.enum(["LOW", "BALANCED", "HIGH"]);
export const milestoneSummarySchema = z.object({
  id: z.uuid(),
  milestoneType,
  achievedStreakDays: z.union([z.literal(3), z.literal(7)]),
  startDate: date,
  achievedDate: date,
  summaryComment: z.string(),
  badges: z.array(milestoneType),
});
export const streakResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    currentStreak: z.number().int().nonnegative(),
    longestStreak: z.number().int().nonnegative(),
    lastRecordedDate: date.nullable(),
    todayRecorded: z.boolean(),
    nextMilestone: z
      .object({
        milestoneType,
        targetStreak: z.union([z.literal(3), z.literal(7)]),
        remainingDays: z.number().int().positive(),
      })
      .nullable(),
    latestMilestoneReport: milestoneSummarySchema.nullable(),
  }),
});
const comparison = z.object({
  initial: conditionLevel.nullable(),
  current: conditionLevel.nullable(),
  improved: z.boolean().nullable(),
});
const photo = z.object({ id: z.string(), recordDate: date, viewUrl: z.url() });
export const milestoneDetailSchema = milestoneSummarySchema.extend({
  comparison: z.object({ hydration: comparison, soothing: comparison, sebum: comparison }),
  snapshots: z.object({ start: photo, achieved: photo }),
});
export const milestoneDetailResponse = z.object({
  success: z.literal(true),
  data: milestoneDetailSchema,
});
export const milestoneListResponse = z.object({
  success: z.literal(true),
  data: z.object({
    reports: z.array(milestoneSummarySchema).max(20),
    nextCursor: z.uuid().nullable(),
  }),
});
export type MilestoneSummary = z.infer<typeof milestoneSummarySchema>;
export type MilestoneDetail = z.infer<typeof milestoneDetailSchema>;
export type StreakData = z.infer<typeof streakResponseSchema>["data"];
