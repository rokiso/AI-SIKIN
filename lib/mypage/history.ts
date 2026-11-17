import "server-only";
import { getPrisma } from "@/lib/prisma";
import type { VerifiedIdentity } from "@/lib/session/identity-types";
import { AuthError } from "@/lib/auth/response";
import { baumannTypeSchema } from "@/lib/dashboard/types";
import { describeBaumannType } from "@/lib/dashboard/summary";
import { snapshotView } from "@/lib/snapshot/service";
import type { HistoryData, HistoryQuery } from "./types";
const badCursor = () =>
  new AuthError(400, "INVALID_HISTORY_QUERY", "이력 조회 요청을 확인해 주세요.");
export async function getMyHistory(
  identity: VerifiedIdentity,
  query: HistoryQuery,
): Promise<HistoryData> {
  if (identity.kind === "anonymous")
    throw new AuthError(401, "SESSION_REQUIRED", "페이지를 새로고침해 주세요.");
  const db = getPrisma();
  const { tab, limit, cursor } = query;
  const result: HistoryData = {
    user: {
      isAuthenticated: identity.kind === "member",
      userId: identity.kind === "member" ? identity.userId : null,
      nickname: identity.kind === "member" ? identity.nickname : "게스트",
      email: null,
    },
    diagnostics: { totalCount: 0, items: [], nextCursor: null },
    snapshots: { totalCount: 0, items: [], nextCursor: null },
  };
  if (tab !== "snapshots") {
    const session = {
      ...(identity.kind === "member"
        ? { userId: identity.userId }
        : { guestDeviceId: identity.guestDeviceId, userId: null }),
      status: "COMPLETED" as const,
    };
    const previous = cursor
      ? await db.diagnosticReport.findFirst({
          where: { id: cursor, session },
          select: { id: true, createdAt: true },
        })
      : null;
    if (cursor && !previous) throw badCursor();
    const [totalCount, rows] = await Promise.all([
      db.diagnosticReport.count({ where: { session } }),
      db.diagnosticReport.findMany({
        where: {
          session,
          ...(previous
            ? {
                OR: [
                  { createdAt: { lt: previous.createdAt } },
                  { createdAt: previous.createdAt, id: { lt: previous.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        select: {
          id: true,
          sessionId: true,
          baumannType: true,
          createdAt: true,
          oilinessScore: true,
          sensitivityScore: true,
          pigmentationScore: true,
          elasticityScore: true,
          summaryText: true,
          recommendedIngredients: true,
          cautionIngredients: true,
        },
      }),
    ]);
    result.diagnostics = {
      totalCount,
      nextCursor: rows.length > limit ? rows[limit - 1].id : null,
      items: rows.slice(0, limit).map((row) => ({
        reportId: row.id,
        sessionId: row.sessionId,
        baumannType: baumannTypeSchema.parse(row.baumannType),
        baumannNameKo: describeBaumannType(baumannTypeSchema.parse(row.baumannType)),
        diagnosedAt: row.createdAt.toISOString(),
        overallScore: null,
        axisScores: {
          oiliness: row.oilinessScore,
          sensitivity: row.sensitivityScore,
          pigmentation: row.pigmentationScore,
          elasticity: row.elasticityScore,
        },
        summary: row.summaryText,
        recommendedIngredients: row.recommendedIngredients,
        cautionIngredients: row.cautionIngredients,
      })),
    };
  }
  if (tab !== "diagnostics" && identity.kind === "member") {
    const userId = identity.userId;
    const previous = cursor
      ? await db.dailySnapshot.findFirst({
          where: { id: cursor, userId },
          select: { id: true, recordDate: true },
        })
      : null;
    if (cursor && !previous) throw badCursor();
    const [totalCount, rows] = await Promise.all([
      db.dailySnapshot.count({ where: { userId } }),
      db.dailySnapshot.findMany({
        where: {
          userId,
          ...(previous
            ? {
                OR: [
                  { recordDate: { lt: previous.recordDate } },
                  { recordDate: previous.recordDate, id: { lt: previous.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ recordDate: "desc" }, { id: "desc" }],
        take: limit + 1,
      }),
    ]);
    const items = await Promise.all(
      rows.slice(0, limit).map(async (row) => {
        const { id, viewUrl, ...view } = await snapshotView(row);
        return { ...view, snapshotId: id, thumbnailUrl: viewUrl };
      }),
    );
    result.snapshots = {
      totalCount,
      items,
      nextCursor: rows.length > limit ? rows[limit - 1].id : null,
    };
  }
  return result;
}
