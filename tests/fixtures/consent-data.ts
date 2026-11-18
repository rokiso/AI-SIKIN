import { randomUUID } from "node:crypto";
import { getPrisma } from "../../lib/prisma";
import { getDatabaseUrl } from "../../lib/server-env";
import { assertLocalDevelopmentDatabase } from "../../lib/database-development";

// Isolated local verification only; never a real published consent policy.
export async function consentFixture() {
  assertLocalDevelopmentDatabase(getDatabaseUrl());
  const db = getPrisma();
  const original = await db.consentTermsVersion.findMany({
    where: { isActive: true },
    select: { id: true },
  });
  await db.consentTermsVersion.updateMany({ where: { isActive: true }, data: { isActive: false } });
  const terms = await db.consentTermsVersion.create({
    data: {
      consentType: "BIOMETRIC_FACE_DATA",
      version: `test-${randomUUID().slice(0, 8)}`,
      title: "로컬 동의 검증용 약관",
      contentMarkdown:
        "수집 항목: 테스트용 얼굴 이미지와 외관 참고 정보. 목적: 격리된 로컬 기능 검증. 보관: 검증 종료 후 테스트 기록 정리. 실제 서비스 수집 동의가 아닙니다. 거부 시 문진만 이용할 수 있습니다.",
      isActive: true,
      enactedAt: new Date(Date.now() - 1000),
    },
  });
  return {
    terms,
    async allowFor(owner: { userId?: string | null; guestDeviceId?: string | null }) {
      const where = owner.userId
        ? { userId: owner.userId }
        : { userId: null, guestDeviceId: owner.guestDeviceId };
      const old = await db.userConsentHistory.findFirst({
        where: { ...where, termsVersionId: terms.id },
      });
      return (
        old ??
        db.userConsentHistory.create({
          data: {
            ...where,
            termsVersionId: terms.id,
            termsVersion: terms.version,
            sensitiveAgreed: true,
            ipAddress: "127.0.0.1",
            ipSource: "TRUSTED_HEADER",
          },
        })
      );
    },
    async cleanup() {
      await db.userConsentHistory.deleteMany({ where: { termsVersionId: terms.id } });
      await db.consentTermsVersion.delete({ where: { id: terms.id } });
      for (const row of original)
        await db.consentTermsVersion.update({ where: { id: row.id }, data: { isActive: true } });
    },
  };
}
