import { isPhotoTestMode } from "@/lib/photo-test-mode";
import "server-only";

import { getPrisma } from "@/lib/prisma";
import { resolveRequestIdentity } from "@/lib/session/identity";
import type { SessionCookieValues } from "@/lib/session/identity-types";
import { getKstDate, getKstRecordDate } from "./date";
import {
  baumannTypeSchema,
  dashboardSummarySchema,
  type DashboardSummary,
  type TodaySnapshot,
} from "./types";

export { describeBaumannType } from "@/lib/diagnostic/baumannMapping";
import { describeBaumannType } from "@/lib/diagnostic/baumannMapping";

export async function getDashboardSummary(
  values: SessionCookieValues,
  now: Date = new Date(),
): Promise<DashboardSummary> {
  const identity = await resolveRequestIdentity(values, now);
  const recordDate = getKstDate(now);
  const emptySnapshot: TodaySnapshot = {
    isRecorded: false,
    snapshotId: null,
    recordDate,
    feedbackComment: null,
    conditions: null,
  };
  const user = {
    isAuthenticated: identity.kind === "member",
    nickname: identity.kind === "member" ? identity.nickname : null,
  };
  if (identity.kind === "anonymous") {
    return {
      hasDiagnosticHistory: false,
      user,
      latestDiagnostic: null,
      todaySnapshot: emptySnapshot,
    };
  }

  const prisma = getPrisma();
  const [diagnosticSession, snapshot] = await Promise.all([
    prisma.diagnosticSession.findFirst({
      where: {
        ...(identity.kind === "member"
          ? { userId: identity.userId }
          : { guestDeviceId: identity.guestDeviceId, userId: null }),
        status: "COMPLETED",
        report: { isNot: null },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        report: {
          select: {
            id: true,
            baumannType: true,
            createdAt: true,
            summaryText: true,
            recommendedIngredients: true,
            cautionIngredients: true,
            oilinessScore: true,
            sensitivityScore: true,
            pigmentationScore: true,
            elasticityScore: true,
          },
        },
      },
    }),
    identity.kind === "member"
      ? prisma.dailySnapshot.findUnique({
          where: {
            uq_user_daily_snapshot: { userId: identity.userId, recordDate: getKstRecordDate(now) },
          },
          select: {
            id: true,
            feedbackComment: true,
            feedbackSource: !isPhotoTestMode(),
            hydrationLevel: true,
            soothingLevel: true,
            sebumLevel: true,
          },
        })
      : Promise.resolve(null),
  ]);

  const todaySnapshot: TodaySnapshot = snapshot
    ? {
        isRecorded: true,
        snapshotId: snapshot.id,
        recordDate,
        feedbackComment: snapshot.feedbackComment,
        conditions: isPhotoTestMode() || snapshot.feedbackSource === "GENERAL_GUIDANCE" ? null : {
          hydrationLevel: snapshot.hydrationLevel,
          soothingLevel: snapshot.soothingLevel,
          sebumLevel: snapshot.sebumLevel,
        },
      }
    : emptySnapshot;
  const report = diagnosticSession?.report;
  if (!report) return { hasDiagnosticHistory: false, user, latestDiagnostic: null, todaySnapshot };

  const baumannType = baumannTypeSchema.parse(report.baumannType);
  return dashboardSummarySchema.parse({
    hasDiagnosticHistory: true,
    user,
    latestDiagnostic: {
      reportId: report.id,
      baumannType,
      baumannNameKo: describeBaumannType(baumannType),
      diagnosedAt: report.createdAt.toISOString(),
      summary: report.summaryText,
      recommendedIngredients: report.recommendedIngredients,
      cautionIngredients: report.cautionIngredients,
      axisScores: {
        oiliness: report.oilinessScore,
        sensitivity: report.sensitivityScore,
        pigmentation: report.pigmentationScore,
        elasticity: report.elasticityScore,
      },
    },
    todaySnapshot,
  });
}
