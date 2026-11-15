import { z } from "zod";
import { uploadCompleteSchema, uploadFileSchema } from "@/lib/diagnostic/upload-validation";
export { uploadFileSchema };
export const snapshotKeySchema = z
  .string()
  .regex(
    /^daily-snapshots\/snp-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/,
  );
export const recordSnapshotSchema = z
  .object({
    s3Key: snapshotKeySchema,
    etag: uploadCompleteSchema.shape.etag,
    idempotencyKey: z
      .string()
      .min(16)
      .max(128)
      .regex(/^[A-Za-z0-9_-]+$/),
  })
  .strict();
const conditionSchema = z.enum(["LOW", "BALANCED", "HIGH"]);
export const snapshotSchema = z.object({
  id: z.string().min(1),
  recordDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  feedbackComment: z.string(),
  feedbackSource: z.enum(["GENERAL_GUIDANCE", "AI"]),
  conditions: z
    .object({
      hydrationLevel: conditionSchema,
      soothingLevel: conditionSchema,
      sebumLevel: conditionSchema,
    })
    .nullable(),
  viewUrl: z.url(),
  createdAt: z.iso.datetime(),
});
export const todaySnapshotResponse = z.object({
  success: z.literal(true),
  data: z.discriminatedUnion("recorded", [
    z.object({ recorded: z.literal(false), snapshot: z.null() }),
    z.object({ recorded: z.literal(true), snapshot: snapshotSchema }),
  ]),
});
export type SnapshotView = z.infer<typeof snapshotSchema>;
