import { z } from "zod";

export const baumannTypeSchema = z.enum([
  "OSPW",
  "OSPT",
  "OSNW",
  "OSNT",
  "ORPW",
  "ORPT",
  "ORNW",
  "ORNT",
  "DSPW",
  "DSPT",
  "DSNW",
  "DSNT",
  "DRPW",
  "DRPT",
  "DRNW",
  "DRNT",
]);
export type BaumannType = z.infer<typeof baumannTypeSchema>;

const scoreSchema = z.number().int().min(0).max(100);
export const axisScoresSchema = z.object({
  oiliness: scoreSchema,
  sensitivity: scoreSchema,
  pigmentation: scoreSchema,
  elasticity: scoreSchema,
});
export type AxisScores = z.infer<typeof axisScoresSchema>;

export const latestDiagnosticSchema = z.object({
  reportId: z.string().min(1),
  baumannType: baumannTypeSchema,
  baumannNameKo: z.string(),
  diagnosedAt: z.iso.datetime(),
  summary: z.string(),
  recommendedIngredients: z.array(z.string()),
  cautionIngredients: z.array(z.string()),
  axisScores: axisScoresSchema,
});
export type LatestDiagnostic = z.infer<typeof latestDiagnosticSchema>;

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const conditionSchema = z.enum(["LOW", "BALANCED", "HIGH"]);
export const todaySnapshotSchema = z.discriminatedUnion("isRecorded", [
  z.object({
    isRecorded: z.literal(false),
    snapshotId: z.null(),
    recordDate: dateSchema,
    feedbackComment: z.null(),
    conditions: z.null(),
  }),
  z.object({
    isRecorded: z.literal(true),
    snapshotId: z.string().min(1),
    recordDate: dateSchema,
    feedbackComment: z.string(),
    conditions: z.object({
      hydrationLevel: conditionSchema,
      soothingLevel: conditionSchema,
      sebumLevel: conditionSchema,
    }),
  }),
]);
export type TodaySnapshot = z.infer<typeof todaySnapshotSchema>;

const userSchema = z.object({ isAuthenticated: z.boolean(), nickname: z.string().nullable() });
export const dashboardSummarySchema = z.discriminatedUnion("hasDiagnosticHistory", [
  z.object({
    hasDiagnosticHistory: z.literal(false),
    user: userSchema,
    latestDiagnostic: z.null(),
    todaySnapshot: todaySnapshotSchema,
  }),
  z.object({
    hasDiagnosticHistory: z.literal(true),
    user: userSchema,
    latestDiagnostic: latestDiagnosticSchema,
    todaySnapshot: todaySnapshotSchema,
  }),
]);
export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;
