import { z } from "zod";

export const uploadFileSchema = z
  .object({
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    fileSizeBytes: z.number().int().min(10_240).max(10_485_760),
  })
  .strict();
export const uploadEtagSchema = z
  .string()
  .regex(/^(?:"[a-fA-F0-9]{32}(?:-\d+)?"|[a-fA-F0-9]{32}(?:-\d+)?)$/)
  .transform((value) => (value.startsWith('"') ? value : `"${value}"`));
export const uploadCompleteSchema = z
  .object({
    uploadSessionId: z.uuid(),
    etag: uploadEtagSchema,
  })
  .strict();
export type UploadFile = z.infer<typeof uploadFileSchema>;
export const uploadExtensions = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" };
