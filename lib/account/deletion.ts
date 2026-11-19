import "server-only";
import { createHmac } from "node:crypto";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { getAuthCookieSecret } from "@/lib/server-env";
import { AuthError } from "@/lib/auth/response";
import { deleteImageObjects } from "@/lib/storage/s3-vault";

export const deletionConfirmationSchema = z
  .object({
    confirmationPhrase: z.literal("탈퇴합니다"),
    agreedToDataLoss: z.literal(true),
  })
  .strict();

export async function deleteAccount(userId: string, sessionToken: string) {
  return getPrisma().$transaction(
    async (tx) => {
      // Blocks new FK-backed uploads, snapshots, consents, account links and sessions.
      // A second deletion waits and then fails live authorization after the first commit.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
      const session = await tx.authSession.findFirst({
        where: { userId, sessionToken, expiresAt: { gt: new Date() } },
        select: { id: true },
      });
      if (!session) throw new AuthError(401, "UNAUTHORIZED", "인증 세션이 유효하지 않습니다.");
      const userHash = createHmac("sha256", getAuthCookieSecret())
        .update(`miruvia:account-deletion:v1:${userId}`)
        .digest("hex");
      // Detect missing audit migration/configuration before irreversible storage work.
      await tx.deletionAuditLog.findFirst({ where: { userHash }, select: { id: true } });

      // Include in-flight/unconfirmed uploads, not just images that reached the timeline.
      const uploads = await tx.imageUploadSession.findMany({ where: { userId } });
      const snapshotUploads = await tx.snapshotUploadSession.findMany({ where: { userId } });
      const snapshots = await tx.dailySnapshot.findMany({
        where: { userId },
        select: { s3Key: true },
      });
      // An issued PUT remains reusable even after the upload was marked UPLOADED.
      // Do not claim erasure while the browser can still recreate the object.
      const outstanding = [...uploads, ...snapshotUploads].some(
        (row) => row.expiresAt.getTime() + 60_000 > Date.now(),
      );
      if (outstanding)
        throw new AuthError(
          409,
          "UPLOAD_LINK_STILL_VALID",
          "최근 사진 업로드 링크가 아직 유효합니다. 업로드 후 최대 16분이 지난 뒤 다시 탈퇴해 주세요.",
        );
      await tx.$queryRaw`SELECT id FROM diagnostic_sessions WHERE user_id = ${userId} FOR UPDATE`;
      const diagnostics = await tx.diagnosticSession.findMany({
        where: { userId },
        select: { id: true, report: { select: { id: true } } },
      });
      const diagnosticIds = diagnostics.map((row) => row.id);
      const reportIds = diagnostics.flatMap((row) => (row.report ? [row.report.id] : []));
      const keys = [
        ...new Set([...uploads, ...snapshotUploads, ...snapshots].map((row) => row.s3Key)),
      ];
      // Fail closed if legacy/inconsistent rows associate the same object with another owner.
      const foreignImages = await tx.imageUploadSession.count({
        where: { s3Key: { in: keys }, OR: [{ userId: null }, { userId: { not: userId } }] },
      });
      const foreignSnapshots = await tx.dailySnapshot.count({
        where: { s3Key: { in: keys }, userId: { not: userId } },
      });
      const foreignUploads = await tx.snapshotUploadSession.count({
        where: { s3Key: { in: keys }, userId: { not: userId } },
      });
      const foreignDiagnostics = await tx.diagnosticSession.count({
        where: {
          uploadSessionId: { in: uploads.map((row) => row.id) },
          OR: [{ userId: null }, { userId: { not: userId } }],
        },
      });
      if (foreignImages + foreignSnapshots + foreignUploads + foreignDiagnostics > 0)
        throw new AuthError(
          409,
          "DELETION_OWNERSHIP_CONFLICT",
          "기록의 소유권을 확인해야 합니다. 삭제를 진행하지 않았습니다. 고객 지원에 문의해 주세요.",
        );
      let deletedImagesCount: number;
      try {
        deletedImagesCount = await deleteImageObjects(keys, AbortSignal.timeout(15_000));
      } catch {
        console.error("[account-deletion] Storage erasure incomplete; account retained");
        throw new AuthError(
          502,
          "STORAGE_DELETION_FAILED",
          "클라우드 저장소 파일 삭제 처리 중 오류가 발생했습니다. 탈퇴가 완료되지 않았습니다. 일부 사진은 이미 삭제되었을 수 있습니다. 다시 시도해 주세요.",
        );
      }
      // These logs have no FK; remove user/report links explicitly before cascades.
      const clicks = await tx.affiliateClickLog.deleteMany({
        where: { OR: [{ userId }, { reportId: { in: reportIds } }] },
      });
      const inference = await tx.aiInferenceAuditLog.deleteMany({
        where: { sessionId: { in: diagnosticIds } },
      });
      const counts = await Promise.all([
        tx.userAccount.count({ where: { userId } }),
        tx.authSession.count({ where: { userId } }),
        tx.userConsentHistory.count({ where: { userId } }),
        tx.productRecommendation.count({ where: { reportId: { in: reportIds } } }),
        tx.procedureGuideMapping.count({ where: { reportId: { in: reportIds } } }),
      ]);
      const deletedRecordsCount =
        1 +
        uploads.length +
        snapshotUploads.length +
        snapshots.length +
        diagnostics.length +
        reportIds.length +
        clicks.count +
        inference.count +
        counts.reduce((a, b) => a + b, 0);
      await tx.user.delete({ where: { id: userId } });
      const deletedAt = new Date();
      await tx.deletionAuditLog.create({
        data: {
          userHash,
          deletedImagesCount,
          deletedRecordsCount,
          completedAt: deletedAt,
        },
      });
      return { deleted: true as const, deletedAt: deletedAt.toISOString(), deletedImagesCount };
    },
    { timeout: 30_000, maxWait: 5_000 },
  );
}
