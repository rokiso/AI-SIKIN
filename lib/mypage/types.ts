import { z } from "zod";
import { latestDiagnosticSchema } from "@/lib/dashboard/types";
import { monthlySnapshotSchema } from "@/lib/snapshot/calendar";
export const historyQuerySchema = z
  .object({
    tab: z.enum(["all", "diagnostics", "snapshots"]).default("all"),
    limit: z
      .string()
      .regex(/^(?:[1-9]|[1-4][0-9]|50)$/)
      .transform(Number)
      .default(20),
    cursor: z.uuid().optional(),
  })
  .strict()
  .refine((value) => !value.cursor || value.tab !== "all");
export type HistoryQuery = z.infer<typeof historyQuerySchema>;
export const historyReportSchema = latestDiagnosticSchema.extend({
  sessionId: z.string(),
  overallScore: z.number().nullable(),
});
export type HistoryReport = z.infer<typeof historyReportSchema>;
export const historySnapshotSchema = monthlySnapshotSchema
  .omit({ id: true })
  .extend({ snapshotId: z.string() });
const page = <T extends z.ZodType>(item: T) =>
  z.object({
    totalCount: z.number().int().nonnegative(),
    items: z.array(item).max(50),
    nextCursor: z.string().nullable(),
  });
export const historyResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    user: z.object({
      isAuthenticated: z.boolean(),
      userId: z.string().nullable(),
      nickname: z.string().nullable(),
      email: z.null(),
    }),
    diagnostics: page(historyReportSchema),
    snapshots: page(historySnapshotSchema),
  }),
});
export type HistoryData = z.infer<typeof historyResponseSchema>["data"];
