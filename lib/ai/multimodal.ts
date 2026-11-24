import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { getAiClientConfiguration, isAiLiveEnabled } from "@/lib/server-env";
import { startAiAuditWrite } from "./audit";
import { AiGatewayError, AiTimeoutError } from "./errors";
import { callAiProvider, loadImageData, RetryableAiError, validateImageReference } from "./client";
import { AI_SYSTEM_INSTRUCTION, visionFeaturesSchema, visionRequestSchema } from "./schema";
import type { MultimodalVisionAnalysisRequest, VisionFeatures } from "./schema";
export type { MultimodalVisionAnalysisRequest } from "./schema";
export type { AiClientConfig } from "./client";
export { AiGatewayError, AiTimeoutError } from "./errors";
export { RetryableAiError } from "./client";

export interface MultimodalVisionAnalysisResponse extends VisionFeatures {
  success: true;
  model: string;
  latencyMs: number;
  tokensUsed: { promptTokens: number; completionTokens: number; totalTokens: number };
  rawPayloadHash: string;
  auditLogId: string;
  // Keep alive with Next after(). Do not expose this promise in public JSON.
  auditWrite: Promise<"SAVED" | "FAILED">;
}

function pause(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(new AiTimeoutError());
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, 250);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}

export async function callMultimodalAiWithTimeout(
  input: MultimodalVisionAnalysisRequest,
  { retry = true } = {},
): Promise<MultimodalVisionAnalysisResponse> {
  const parsed = visionRequestSchema.safeParse(input);
  if (!parsed.success)
    throw new AiGatewayError("AI_INVALID_REQUEST", "AI 요청 내용을 확인해 주세요.", 400);
  const request = parsed.data;
  validateImageReference(request.imageUrl, request.mimeType);
  if (!isAiLiveEnabled())
    throw new AiGatewayError("AI_DISABLED", "실제 AI 호출이 비활성화되어 있습니다.", 503);
  const config = getAiClientConfiguration();
  const timeoutMs = Math.min(config.timeoutMs, request.timeoutMs ?? 8000, 8000);
  const instruction = [AI_SYSTEM_INSTRUCTION, request.systemInstruction ?? ""].join("\n");
  const promptTemplateHash = createHash("sha256").update(instruction).digest("hex");
  const auditLogId = randomUUID();
  const started = performance.now();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new AiTimeoutError());
    }, timeoutMs);
  });
  const metadata = {
    id: auditLogId,
    sessionId: request.sessionId,
    provider: config.provider,
    modelName: config.modelName,
    promptTemplateHash,
  };
  try {
    const result = await Promise.race([
      (async () => {
        const image = await loadImageData(request.imageUrl, request.mimeType, controller.signal);
        for (let attempt = 0; ; attempt++) {
          if (controller.signal.aborted) throw new AiTimeoutError();
          try {
            return await callAiProvider(
              config,
              image,
              request.mimeType,
              instruction,
              request.surveyScores,
              controller.signal,
            );
          } catch (error) {
            if (controller.signal.aborted) throw new AiTimeoutError();
            const retryable = error instanceof RetryableAiError || error instanceof TypeError;
            if (!retry || !retryable || attempt >= config.maxRetries) throw error;
            await pause(controller.signal);
          }
        }
      })(),
      deadline,
    ]);
    let features: VisionFeatures;
    try {
      features = visionFeaturesSchema.parse(JSON.parse(result.text));
    } catch {
      throw new AiGatewayError("AI_INVALID_RESPONSE");
    }
    if (/완치|처방|항생제|스테로이드|치료|확진/.test(JSON.stringify(features)))
      throw new AiGatewayError("AI_UNSAFE_RESPONSE");
    const latencyMs = Math.round(performance.now() - started);
    const auditWrite = startAiAuditWrite({
      ...metadata,
      latencyMs,
      ...result.tokensUsed,
      status: "SUCCESS",
    });
    return {
      success: true,
      model: config.modelName,
      latencyMs,
      ...features,
      tokensUsed: result.tokensUsed,
      rawPayloadHash: createHash("sha256").update(result.raw).digest("hex"),
      auditLogId,
      auditWrite,
    };
  } catch (cause) {
    const error = controller.signal.aborted
      ? new AiTimeoutError()
      : cause instanceof AiGatewayError
        ? cause
        : new AiGatewayError();
    error.auditLogId = auditLogId;
    error.auditWrite = startAiAuditWrite({
      ...metadata,
      latencyMs: Math.round(performance.now() - started),
      status: error instanceof AiTimeoutError ? "TIMEOUT" : "ERROR",
      errorMessage:
        error.code === "AI_GATEWAY_TIMEOUT"
          ? "AI_GATEWAY_TIMEOUT"
          : error.code === "AI_INVALID_RESPONSE"
            ? "AI_INVALID_RESPONSE"
            : error.code === "AI_UNSAFE_RESPONSE"
              ? "AI_UNSAFE_RESPONSE"
              : error.code === "AI_INVALID_IMAGE"
                ? "AI_INVALID_IMAGE"
                : "AI_PROVIDER_ERROR",
    });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
