import "server-only";
import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { UploadError, type UploadOwner } from "@/lib/diagnostic/upload-types";
import { consentSubmissionSchema, consentTermsSchema } from "./types";
import type { consentRequestMetadata } from "@/lib/server/getClientIp";

const type = "BIOMETRIC_FACE_DATA" as const;
const ownerWhere = (owner: UploadOwner) =>
  owner.kind === "member"
    ? { userId: owner.userId }
    : { userId: null, guestDeviceId: owner.guestDeviceId };
async function activeTerms(tx: Prisma.TransactionClient, lock = false) {
  if (lock)
    await tx.$queryRaw`SELECT id FROM consent_terms_versions WHERE consent_type='BIOMETRIC_FACE_DATA' AND is_active=true AND enacted_at<=CURRENT_TIMESTAMP FOR SHARE`;
  const terms = await tx.consentTermsVersion.findFirst({
    where: { consentType: type, isActive: true, enactedAt: { lte: new Date() } },
  });
  if (!terms)
    throw new UploadError(
      404,
      "TERMS_NOT_FOUND",
      "사진 서비스의 동의 약관을 준비하고 있습니다. 지금은 문진만 이용해 주세요.",
    );
  return terms;
}
function projectTerms(row: {
  id: string;
  consentType: string;
  version: string;
  title: string;
  contentMarkdown: string;
  enactedAt: Date;
}) {
  return consentTermsSchema.parse({
    termsId: row.id,
    consentType: row.consentType,
    version: row.version,
    title: row.title,
    contentMarkdown: row.contentMarkdown,
    enactedAt: row.enactedAt.toISOString(),
  });
}
export async function getLatestConsentTerms() {
  return projectTerms(await activeTerms(getPrisma()));
}
export async function getConsentStatus(owner: UploadOwner) {
  return getPrisma().$transaction(async (tx) => {
    const active = await activeTerms(tx, true);
    const previous = await tx.userConsentHistory.findFirst({
      where: { ...ownerWhere(owner), consentType: type },
      orderBy: [{ agreedAt: "desc" }, { id: "desc" }],
    });
    return {
      consentType: type,
      hasValidConsent: Boolean(previous?.sensitiveAgreed && previous.termsVersionId === active.id),
      requiresReconsent: Boolean(
        previous?.sensitiveAgreed && previous.termsVersionId !== active.id,
      ),
      activeVersion: active.version,
      consentedVersion: previous?.termsVersion ?? null,
      consentedAt: previous?.agreedAt.toISOString() ?? null,
    };
  });
}
export async function recordConsent(
  owner: UploadOwner,
  input: unknown,
  metadata: ReturnType<typeof consentRequestMetadata>,
) {
  const data = consentSubmissionSchema.parse(input);
  return getPrisma().$transaction(async (tx) => {
    const key = owner.kind === "guest" ? `guest:${owner.guestDeviceId}` : `consent:${owner.userId}`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))::text`;
    const active = await activeTerms(tx, true);
    if (data.termsVersion !== active.version)
      throw new UploadError(
        409,
        "TERMS_VERSION_MISMATCH",
        "약관 버전이 갱신되었습니다. 최신 약관을 확인한 후 다시 동의해 주세요.",
      );
    const count = await tx.userConsentHistory.count({
      where: { ...ownerWhere(owner), agreedAt: { gt: new Date(Date.now() - 3600000) } },
    });
    if (count >= 10)
      throw new UploadError(
        429,
        "CONSENT_RATE_LIMIT",
        "동의 요청이 많습니다. 잠시 후 다시 시도해 주세요.",
      );
    const row = await tx.userConsentHistory.create({
      data: {
        ...ownerWhere(owner),
        termsVersionId: active.id,
        termsVersion: active.version,
        consentType: type,
        sensitiveAgreed: true,
        ...metadata,
      },
    });
    return {
      consentId: row.id,
      consentType: type,
      version: row.termsVersion,
      isAgreed: true,
      consentedAt: row.agreedAt.toISOString(),
    };
  });
}
export async function requireBiometricConsent(owner: UploadOwner, tx: Prisma.TransactionClient) {
  let active;
  try {
    active = await activeTerms(tx, true);
  } catch (error) {
    if (!(error instanceof UploadError)) throw error;
    throw new UploadError(
      403,
      "CONSENT_REQUIRED",
      "사진 수집 약관과 최신 동의를 확인할 수 없습니다. 문진 화면에서 다시 확인해 주세요.",
    );
  }
  const row = await tx.userConsentHistory.findFirst({
    where: { ...ownerWhere(owner), consentType: type },
    orderBy: [{ agreedAt: "desc" }, { id: "desc" }],
  });
  if (!row?.sensitiveAgreed || row.termsVersionId !== active.id)
    throw new UploadError(
      403,
      "CONSENT_REQUIRED",
      "사진을 전송하기 전에 최신 민감정보 수집·이용 동의가 필요합니다.",
    );
}
// Only the verified OAuth transaction may call this one-time binding. DB triggers
// reject rebinding or changing any original consent facts.
export async function transferConsentOwnership(
  tx: Prisma.TransactionClient,
  guestDeviceId: string,
  userId: string,
) {
  return tx.userConsentHistory.updateMany({
    where: { guestDeviceId, userId: null },
    data: { userId },
  });
}
