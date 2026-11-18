import "server-only";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { AuthError } from "@/lib/auth/response";
import { resolveRequestIdentity } from "@/lib/session/identity";
import type { SessionCookieValues } from "@/lib/session/identity-types";
import { assertReportOwner, projectReport } from "./report-store";

export async function readProgressState(values: SessionCookieValues, sessionId: string) {
  const identity = await resolveRequestIdentity(values);
  if (identity.kind === "anonymous")
    throw new AuthError(
      401,
      "SESSION_REQUIRED",
      "세션을 확인할 수 없습니다. 새로고침한 뒤 다시 시도해 주세요.",
    );
  const session = await getPrisma().diagnosticSession.findUnique({
    where: { id: sessionId },
    include: { report: true },
  });
  if (!session) throw new AuthError(404, "SESSION_NOT_FOUND", "저장된 문진을 찾을 수 없습니다.");
  assertReportOwner(identity, session);
  return {
    status: session.status,
    report: session.report ? projectReport(session.report) : null,
    reason: session.report
      ? z.object({ reason: z.string() }).safeParse(session.report.aiAuditMetadata).data?.reason
      : undefined,
  };
}
export function terminalEvent(state: Awaited<ReturnType<typeof readProgressState>>) {
  const report = state.report;
  if (!report) return null;
  if (report.isFallback)
    return {
      event: "fallback",
      data: {
        reportId: report.reportId,
        reason:
          state.reason === "AI_GATEWAY_TIMEOUT"
            ? "TIMEOUT"
            : ["AI_DISABLED", "NO_PHOTO"].includes(state.reason ?? "")
              ? "QUESTIONNAIRE_ONLY"
              : "AI_SERVICE_UNAVAILABLE",
        message:
          state.reason === "AI_GATEWAY_TIMEOUT"
            ? "사진 AI 응답이 지연되어 문진 기반 참고 리포트로 전환했어요."
            : "사진 AI를 적용하지 않은 문진 기반 참고 리포트가 준비됐어요.",
      },
    };
  return {
    event: "complete",
    data: {
      reportId: report.reportId,
      baumannType: report.baumannType,
      isFallback: false,
      completedAt: report.createdAt,
    },
  };
}
