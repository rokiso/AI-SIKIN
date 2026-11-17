import "server-only";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";

const payloadSchema = z
  .object({
    id: z.uuid(),
    sessionId: z.uuid().optional(),
    provider: z.enum(["OPENAI", "GEMINI"]),
    modelName: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/),
    promptTemplateHash: z.string().regex(/^[a-f0-9]{64}$/),
    latencyMs: z.number().int().nonnegative().max(2_147_483_647),
    promptTokens: z.number().int().nonnegative().optional(),
    completionTokens: z.number().int().nonnegative().optional(),
    totalTokens: z.number().int().nonnegative().optional(),
    status: z.enum(["SUCCESS", "TIMEOUT", "ERROR"]),
    // Store a controlled code, never provider messages, URLs, images, prompts or keys.
    errorMessage: z
      .enum([
        "AI_GATEWAY_TIMEOUT",
        "AI_PROVIDER_ERROR",
        "AI_INVALID_RESPONSE",
        "AI_UNSAFE_RESPONSE",
        "AI_INVALID_IMAGE",
        "AI_INVALID_REQUEST",
        "AI_DISABLED",
        "AI_CONFIGURATION_UNAVAILABLE",
      ])
      .optional(),
  })
  .strict();
export type CreateAiAuditLogInput = z.input<typeof payloadSchema>;

export async function recordAiAuditLog(payload: CreateAiAuditLogInput): Promise<string> {
  const data = payloadSchema.parse(payload);
  const row = await getPrisma().aiInferenceAuditLog.create({ data, select: { id: true } });
  return row.id;
}

export function startAiAuditWrite(payload: CreateAiAuditLogInput): Promise<"SAVED" | "FAILED"> {
  return recordAiAuditLog(payload).then(
    () => "SAVED" as const,
    () => {
      console.error("[ai-audit] Metadata write failed", { auditLogId: payload.id });
      return "FAILED" as const;
    },
  );
}
