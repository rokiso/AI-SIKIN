import { z } from "zod";
import { axisScoresSchema, baumannTypeSchema } from "@/lib/dashboard/types";
export const reportSchema = z.object({
  reportId: z.uuid(),
  sessionId: z.uuid(),
  baumannType: baumannTypeSchema,
  baumannNameKo: z.string(),
  axisScores: axisScoresSchema,
  overallScore: z.null(),
  summary: z.string(),
  recommendedIngredients: z.array(z.string()),
  cautionIngredients: z.array(z.string()),
  isFallback: z.boolean(),
  source: z.enum(["QUESTIONNAIRE", "AI_ASSISTED", "LEGACY"]),
  createdAt: z.iso.datetime(),
});
export type DiagnosticReportView = z.infer<typeof reportSchema>;
export const analyzeInputSchema = z.object({ sessionId: z.uuid() }).strict();
export const analyzeResponseSchema = z.object({
  success: z.literal(true),
  data: z.discriminatedUnion("status", [
    reportSchema.extend({ status: z.literal("COMPLETED") }),
    z.object({ status: z.literal("ANALYSIS_PENDING"), sessionId: z.uuid() }),
  ]),
});
