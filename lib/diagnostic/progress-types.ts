import { z } from "zod";
import { baumannTypeSchema } from "@/lib/dashboard/types";
export const progressSchema = z.object({
  step: z.enum(["EXTRACTING_FEATURES", "COMBINING_SURVEY", "GENERATING_REPORT"]),
  stepNumber: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  progressPercent: z.number().int().min(0).max(100),
  message: z.string().max(300),
  skipped: z.boolean(),
});
export type DiagnosticProgress = z.infer<typeof progressSchema>;
export const completeSchema = z.object({
  reportId: z.uuid(),
  baumannType: baumannTypeSchema,
  isFallback: z.boolean(),
  completedAt: z.iso.datetime(),
});
export const fallbackSchema = z.object({
  reason: z.enum(["TIMEOUT", "AI_SERVICE_UNAVAILABLE", "QUESTIONNAIRE_ONLY"]),
  message: z.string().max(300),
  reportId: z.uuid(),
});
export const progressErrorSchema = z.object({
  code: z.string().max(80),
  message: z.string().max(300),
});
export const notificationSchema = z.object({ sessionId: z.uuid(), progress: progressSchema });
export type ProgressNotification = z.infer<typeof notificationSchema>;
