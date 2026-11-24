import "server-only";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { AuthError } from "@/lib/auth/response";
import { isDiagnosticFallbackStorageEnabled } from "@/lib/server-env";
import type { DiagnosticReport } from "@/generated/prisma/client";
import type { UploadOwner } from "./upload-session";
import { describeBaumannType } from "./baumannMapping";
import { baumannTypeSchema } from "@/lib/dashboard/types";
import { reportSchema } from "./report-types";

export function ownerWhere(owner: UploadOwner) {
  return owner.kind === "member"
    ? { userId: owner.userId }
    : { userId: null, guestDeviceId: owner.guestDeviceId };
}
export function assertReportOwner(
  owner: UploadOwner,
  session: { userId: string | null; guestDeviceId: string | null },
  scope: "report" | "session" = "report",
) {
  if (
    owner.kind === "member"
      ? session.userId !== owner.userId
      : session.userId !== null || session.guestDeviceId !== owner.guestDeviceId
  )
    throw new AuthError(
      403,
      scope === "session" ? "FORBIDDEN_SESSION_ACCESS" : "FORBIDDEN_REPORT_ACCESS",
      "본인의 문진과 리포트만 확인할 수 있습니다.",
    );
}
// Explicit selection prevents Prisma from reading columns absent from a pre-migration DB.
export function diagnosticReportSelect() {
  const enabled = isDiagnosticFallbackStorageEnabled();
  return {
    id: true,
    sessionId: true,
    baumannType: true,
    oilinessScore: true,
    sensitivityScore: true,
    pigmentationScore: true,
    elasticityScore: true,
    summaryText: true,
    recommendedIngredients: true,
    cautionIngredients: true,
    aiAuditMetadata: true,
    createdAt: true,
    isFallback: enabled,
    fallbackReason: enabled,
  } as const;
}

type StoredReport = Omit<DiagnosticReport, "isFallback" | "fallbackReason"> &
  Partial<Pick<DiagnosticReport, "isFallback" | "fallbackReason">>;
export function projectReport(row: StoredReport) {
  const metadata = z
    .object({
      source: z.enum(["QUESTIONNAIRE", "AI_ASSISTED"]),
      isFallback: z.boolean(),
      reason: z.string().optional(),
    })
    .safeParse(row.aiAuditMetadata);
  const type = baumannTypeSchema.parse(row.baumannType);
  const reason = metadata.data?.reason;
  const showFallbackNotice =
    row.fallbackReason ||
    (metadata.data?.isFallback && reason && !["AI_DISABLED", "NO_PHOTO"].includes(reason));
  return reportSchema.parse({
    reportId: row.id,
    sessionId: row.sessionId,
    baumannType: type,
    baumannNameKo: describeBaumannType(type),
    axisScores: {
      oiliness: row.oilinessScore,
      sensitivity: row.sensitivityScore,
      pigmentation: row.pigmentationScore,
      elasticity: row.elasticityScore,
    },
    overallScore: null,
    summary: row.summaryText,
    recommendedIngredients: row.recommendedIngredients,
    cautionIngredients: row.cautionIngredients,
    source: metadata.success ? metadata.data.source : "LEGACY",
    isFallback: row.isFallback || (metadata.data?.isFallback ?? false),
    fallbackNotice: showFallbackNotice
      ? "사진 AI 분석을 완료하지 못해 바우만 피부 문진 12문항 응답으로 참고 리포트를 만들었어요."
      : undefined,
    createdAt: row.createdAt.toISOString(),
  });
}
export async function getDiagnosticReport(owner: UploadOwner, id: string) {
  if (!z.uuid().safeParse(id).success)
    throw new AuthError(400, "INVALID_REPORT_ID", "리포트 주소를 확인해 주세요.");
  const row = await getPrisma().diagnosticReport.findUnique({
    where: { id },
    select: {
      ...diagnosticReportSelect(),
      session: { select: { userId: true, guestDeviceId: true } },
    },
  });
  if (!row)
    throw new AuthError(
      404,
      "REPORT_NOT_FOUND",
      "리포트를 찾을 수 없습니다. 보관함에서 다시 선택해 주세요.",
    );
  assertReportOwner(owner, row.session);
  return projectReport(row);
}
