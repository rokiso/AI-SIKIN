import "server-only";
import { after } from "next/server";
import { publishProgress } from "./progressEmitter";
import { requireBiometricConsent } from "@/lib/consent/service";
import { UploadError } from "./upload-types";
import { getPrisma } from "@/lib/prisma";
import { AuthError } from "@/lib/auth/response";
import { isAiLiveEnabled } from "@/lib/server-env";
import { callMultimodalAiWithTimeout, AiGatewayError } from "@/lib/ai/multimodal";
import { readImageMetadata, signImageView } from "@/lib/storage/s3-vault";
import { uploadEtagSchema, uploadFileSchema } from "./upload-validation";
import type { UploadOwner } from "./upload-session";
import { scoreBaumannAnswers } from "./baumannScoring";
import { ruleBasedEvaluator, combineVisionScores } from "./ruleBasedEvaluator";
import { assertReportOwner, ownerWhere, projectReport } from "./report-store";
import { analyzeInputSchema } from "./report-types";

const pending = (sessionId: string) => ({ status: "ANALYSIS_PENDING" as const, sessionId });
const completed = (report: ReturnType<typeof projectReport>) => ({
  status: "COMPLETED" as const,
  ...report,
});

// Claims and commits are short transactions. Never hold a database lock during an AI call.
export async function analyzeSession(owner: UploadOwner, input: { sessionId: string }) {
  const { sessionId } = analyzeInputSchema.parse(input);
  const db = getPrisma();
  const claim = await db.$transaction(async (tx) => {
    const key = `analysis:${owner.kind}:${owner.kind === "member" ? owner.userId : owner.guestDeviceId}`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
    const session = await tx.diagnosticSession.findUnique({
      where: { id: sessionId },
      include: { report: true, uploadSession: true },
    });
    if (!session)
      throw new AuthError(
        400,
        "SESSION_NOT_FOUND",
        "문진 정보를 찾을 수 없습니다. 문진을 다시 시작해 주세요.",
      );
    assertReportOwner(owner, session);
    if (session.report)
      return { kind: "completed" as const, report: projectReport(session.report) };
    const now = new Date();
    if (
      session.status === "ANALYSIS_PENDING" &&
      now.getTime() - session.updatedAt.getTime() < 30_000
    )
      return { kind: "pending" as const };
    const scores = scoreBaumannAnswers(session.surveyAnswers).axisScores;
    if (session.status !== "ANALYSIS_PENDING") {
      const count = await tx.diagnosticSession.count({
        where: {
          ...ownerWhere(owner),
          status: { in: ["ANALYSIS_PENDING", "COMPLETED"] },
          updatedAt: { gt: new Date(now.getTime() - 3_600_000) },
        },
      });
      if (count >= 3)
        throw new AuthError(
          429,
          "RATE_LIMIT_EXCEEDED",
          "리포트는 1시간에 3회까지 만들 수 있습니다. 잠시 후 다시 시도해 주세요.",
        );
    }
    const changed = await tx.diagnosticSession.updateMany({
      where: {
        id: sessionId,
        ...ownerWhere(owner),
        status: session.status,
        updatedAt: session.updatedAt,
      },
      data: { status: "ANALYSIS_PENDING", updatedAt: now },
    });
    if (changed.count !== 1) return { kind: "pending" as const };
    return { kind: "claimed" as const, at: now, scores, upload: session.uploadSession };
  });
  if (claim.kind === "completed") return completed(claim.report);
  if (claim.kind === "pending") return pending(sessionId);

  let usesPhoto = isAiLiveEnabled() && Boolean(claim.upload);
  let consentUnavailable = false;
  if (usesPhoto) {
    try {
      await db.$transaction((tx) => requireBiometricConsent(owner, tx));
    } catch (error) {
      if (!(error instanceof UploadError)) throw error;
      usesPhoto = false;
      consentUnavailable = true;
    }
  }
  await publishProgress(sessionId, {
    step: "EXTRACTING_FEATURES",
    stepNumber: 1,
    progressPercent: 35,
    skipped: !usesPhoto,
    message: usesPhoto
      ? "등록된 사진의 외관 참고 정보를 확인하고 있어요."
      : "사진 AI를 적용하지 않고 문진 응답을 확인해요.",
  });
  let result = ruleBasedEvaluator(claim.scores);
  let source: "QUESTIONNAIRE" | "AI_ASSISTED" = "QUESTIONNAIRE";
  let reason = consentUnavailable ? "CONSENT_REQUIRED" : "NO_PHOTO";
  let auditLogId: string | undefined;
  let visualWeight = 0;
  if (!isAiLiveEnabled()) reason = "AI_DISABLED";
  else if (claim.upload && usesPhoto) {
    // Include storage verification in the same eight-second budget as AI inference.
    const started = performance.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    try {
      assertReportOwner(owner, claim.upload);
      await db.$transaction((tx) => requireBiometricConsent(owner, tx));
      const file = uploadFileSchema.safeParse({
        mimeType: claim.upload.mimeType,
        fileSizeBytes: claim.upload.fileSizeBytes,
      });
      if (claim.upload.status !== "UPLOADED" || !file.success)
        throw new AiGatewayError("PHOTO_UNAVAILABLE");
      const metadata = await readImageMetadata(claim.upload.s3Key, controller.signal);
      if (
        !metadata ||
        !claim.upload.etag ||
        metadata.etag !== uploadEtagSchema.parse(claim.upload.etag) ||
        metadata.size !== file.data.fileSizeBytes ||
        metadata.mimeType !== file.data.mimeType ||
        metadata.encryption !== "AES256"
      )
        throw new AiGatewayError("PHOTO_UNAVAILABLE");
      const imageUrl = await signImageView(claim.upload.s3Key);
      const remaining = Math.floor(8_000 - (performance.now() - started));
      if (remaining <= 0) throw new AiGatewayError("AI_GATEWAY_TIMEOUT");
      const ai = await callMultimodalAiWithTimeout({
        sessionId,
        imageUrl,
        mimeType: file.data.mimeType,
        surveyScores: claim.scores,
        timeoutMs: remaining,
        systemInstruction:
          "문진 점수 비중은 최소 60%입니다. 사진 정보는 참고용입니다. 질병·의학적 진단, 치료, 완치, 처방 표현을 출력하지 마세요.",
      });
      auditLogId = ai.auditLogId;
      after(async () => {
        await ai.auditWrite;
      });
      if (ai.extractedFeatures.confidenceScore === 0) reason = "LOW_CONFIDENCE";
      else {
        const combined = ruleBasedEvaluator(
          combineVisionScores(claim.scores, ai.extractedFeatures),
        );
        result = {
          ...combined,
          summary: ai.clinicalImpressionSummary,
          recommendedIngredients: ai.recommendedActiveIngredients.length
            ? ai.recommendedActiveIngredients
            : combined.recommendedIngredients,
          cautionIngredients: ai.cautionIngredients.length
            ? ai.cautionIngredients
            : combined.cautionIngredients,
        };
        source = "AI_ASSISTED";
        reason = "NONE";
        visualWeight = 0.4 * ai.extractedFeatures.confidenceScore;
      }
    } catch (error) {
      if (error instanceof AuthError) throw error;
      if (error instanceof UploadError) reason = "CONSENT_REQUIRED";
      else if (error instanceof AiGatewayError) {
        reason = error.code;
        auditLogId = error.auditLogId;
        const write = error.auditWrite;
        if (write)
          after(async () => {
            await write;
          });
      } else {
        reason = controller.signal.aborted ? "AI_GATEWAY_TIMEOUT" : "PHOTO_UNAVAILABLE";
        console.error(
          "[diagnostic-analysis] Photo preparation unavailable; questionnaire mode selected",
        );
      }
    } finally {
      clearTimeout(timer);
    }
  }

  await publishProgress(sessionId, {
    step: "COMBINING_SURVEY",
    stepNumber: 2,
    progressPercent: 70,
    skipped: false,
    message:
      source === "AI_ASSISTED"
        ? "문진을 최소 60% 반영해 참고 정보를 정리했어요."
        : "저장된 문진 응답으로 피부 특성을 정리했어요.",
  });
  await publishProgress(sessionId, {
    step: "GENERATING_REPORT",
    stepNumber: 3,
    progressPercent: 95,
    skipped: false,
    message: "리포트와 성분 안내를 저장하고 있어요.",
  });
  return db.$transaction(async (tx) => {
    const session = await tx.diagnosticSession.findUniqueOrThrow({
      where: { id: sessionId },
      include: { report: true },
    });
    assertReportOwner(owner, session);
    if (session.report) return completed(projectReport(session.report));
    // A recovered claim fences off a late worker. Owner transfer must also invalidate it.
    const changed = await tx.diagnosticSession.updateMany({
      where: {
        id: sessionId,
        ...ownerWhere(owner),
        status: "ANALYSIS_PENDING",
        updatedAt: claim.at,
      },
      data: { status: "COMPLETED" },
    });
    if (changed.count !== 1) return pending(sessionId);
    const report = await tx.diagnosticReport.create({
      data: {
        sessionId,
        baumannType: result.baumannType,
        oilinessScore: result.axisScores.oiliness,
        sensitivityScore: result.axisScores.sensitivity,
        pigmentationScore: result.axisScores.pigmentation,
        elasticityScore: result.axisScores.elasticity,
        summaryText: result.summary,
        recommendedIngredients: result.recommendedIngredients,
        cautionIngredients: result.cautionIngredients,
        aiAuditMetadata: {
          version: 1,
          source,
          isFallback: source === "QUESTIONNAIRE",
          reason,
          visualWeight,
          ...(auditLogId ? { auditLogId, auditStatus: "PENDING" } : {}),
        },
      },
    });
    return completed(projectReport(report));
  });
}
