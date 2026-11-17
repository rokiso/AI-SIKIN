import { after } from "next/server";
import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { AuthError, privateHeaders, smallJson } from "@/lib/auth/response";
import { getAiClientConfiguration, isAiLiveEnabled } from "@/lib/server-env";
import { readSessionCookies, resolveRequestIdentity } from "@/lib/session/identity";
import {
  AI_HEALTHCHECK_IMAGE,
  authorizeAiAdmin,
  consumeAiHealthcheckLimit,
  isAiSystemRequest,
} from "@/lib/ai/healthcheck";
import { AiGatewayError, callMultimodalAiWithTimeout } from "@/lib/ai/multimodal";
import { validateImageReference } from "@/lib/ai/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const bodySchema = z
  .object({
    dryRun: z.boolean().default(true),
    mockImageBase64: z
      .string()
      .max(4096)
      .regex(/^data:image\/(png|jpeg|webp);base64,/)
      .optional(),
  })
  .strict();

export async function POST(request: Request) {
  try {
    let principal: string;
    if (isAiSystemRequest(request)) {
      if (
        request.headers.get("sec-fetch-site") === "cross-site" ||
        (request.headers.get("origin") &&
          request.headers.get("origin") !== new URL(request.url).origin)
      )
        throw new AuthError(403, "FORBIDDEN_REQUEST", "요청 출처를 확인해 주세요.");
      principal = "system";
    } else {
      principal = authorizeAiAdmin(
        request,
        await resolveRequestIdentity(readSessionCookies(await cookies())),
      );
    }
    consumeAiHealthcheckLimit(principal);
    const body = bodySchema.safeParse(await smallJson(request));
    if (!body.success)
      throw new AuthError(400, "INVALID_AI_HEALTHCHECK_REQUEST", "점검 요청 내용을 확인해 주세요.");
    const imageUrl = body.data.mockImageBase64 ?? AI_HEALTHCHECK_IMAGE;
    const mimeType = imageUrl.startsWith("data:image/jpeg;")
      ? "image/jpeg"
      : imageUrl.startsWith("data:image/webp;")
        ? "image/webp"
        : "image/png";
    validateImageReference(imageUrl, mimeType);
    const config = getAiClientConfiguration();
    if (body.data.dryRun) {
      return Response.json(
        {
          success: true,
          data: {
            status: "CONFIGURED",
            provider: config.provider,
            model: config.modelName,
            dryRun: true,
            remoteChecked: false,
            liveEnabled: isAiLiveEnabled(),
            timeoutEnforcedMs: config.timeoutMs,
            checkedAt: new Date().toISOString(),
          },
        },
        { headers: privateHeaders },
      );
    }
    const result = await callMultimodalAiWithTimeout({
      imageUrl,
      mimeType,
      surveyScores: { oiliness: 50, sensitivity: 50, pigmentation: 50, elasticity: 50 },
    });
    after(async () => {
      await result.auditWrite;
    });
    return Response.json(
      {
        success: true,
        data: {
          status: "HEALTHY",
          provider: config.provider,
          model: result.model,
          dryRun: false,
          remoteChecked: true,
          latencyMs: result.latencyMs,
          timeoutEnforcedMs: config.timeoutMs,
          healthcheckEcho: {
            visualOilinessHint: result.extractedFeatures.visualOilinessHint,
            confidenceScore: result.extractedFeatures.confidenceScore,
          },
          auditLogId: result.auditLogId,
          auditStatus: "PENDING",
          checkedAt: new Date().toISOString(),
        },
      },
      { headers: privateHeaders },
    );
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof AiGatewayError) {
      if (error.auditWrite) {
        const write = error.auditWrite;
        after(async () => {
          await write;
        });
      }
      return Response.json(
        {
          success: false,
          error: { code: error.code, message: error.message },
          ...(error.auditLogId ? { auditLogId: error.auditLogId, auditStatus: "PENDING" } : {}),
        },
        { status: error.httpStatus, headers: privateHeaders },
      );
    }
    if (error instanceof AuthError)
      return Response.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.status, headers: privateHeaders },
      );
    console.error("[ai-healthcheck] Check unavailable");
    return Response.json(
      {
        success: false,
        error: {
          code: "AI_HEALTHCHECK_UNAVAILABLE",
          message: "AI 점검을 처리하지 못했습니다. 다시 시도해 주세요.",
        },
      },
      { status: 503, headers: privateHeaders },
    );
  }
}
