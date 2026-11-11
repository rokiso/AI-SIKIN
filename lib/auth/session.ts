import "server-only";
import { randomBytes } from "node:crypto";
import { getPrisma } from "@/lib/prisma";
import { verifyGuestProof } from "@/lib/session/guest-proof";
import type { SessionCookieValues } from "@/lib/session/identity-types";
import type { SocialProfile } from "./providers";
import type { OAuthPayload } from "./pkce";
import { digest } from "./pkce";
import { AuthError } from "./response";
export const SESSION_SECONDS = 30 * 86400;
export function invalidState(): never {
  throw new AuthError(
    400,
    "INVALID_OAUTH_STATE",
    "인증 세션이 만료되었거나 유효하지 않은 인증 요청입니다. 다시 로그인해주세요.",
  );
}
export async function provisionSession(
  profile: SocialProfile,
  flow: OAuthPayload,
  values: SessionCookieValues,
) {
  const provider = profile.provider === "google" ? "GOOGLE" : "KAKAO";
  const guestId =
    verifyGuestProof(values.guestId, values.guestProof) && values.guestId === flow.guestId
      ? flow.guestId
      : null;
  const token = randomBytes(32).toString("hex");
  return getPrisma().$transaction(async (tx) => {
    const consumed = await tx.oAuthAttempt.deleteMany({
      where: { stateHash: digest(flow.state), expiresAt: { gt: new Date() } },
    });
    if (consumed.count !== 1) invalidState();
    const accountLock = `oauth:${provider}:${profile.id}`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${accountLock}, 0))::text`;
    let account = await tx.userAccount.findUnique({
      where: { uq_provider_account: { provider, providerAccountId: profile.id } },
      include: { user: true },
    });
    if (!account) {
      // Never merge independent providers by matching email: that is not proof of account ownership.
      const emailLock = `oauth-email:${profile.email ?? profile.id}`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${emailLock}, 0))::text`;
      const duplicateEmail = profile.email
        ? await tx.user.findUnique({ where: { email: profile.email }, select: { id: true } })
        : null;
      account = await tx.userAccount.create({
        data: {
          provider,
          providerAccountId: profile.id,
          user: {
            create: { nickname: profile.nickname, email: duplicateEmail ? null : profile.email },
          },
        },
        include: { user: true },
      });
    }
    let migratedSessionsCount = 0;
    if (guestId) {
      const guestLock = `guest:${guestId}`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${guestLock}, 0))::text`;
      const diagnostics = await tx.diagnosticSession.updateMany({
        where: { guestDeviceId: guestId, userId: null },
        data: { userId: account.userId },
      });
      await tx.imageUploadSession.updateMany({
        where: { guestDeviceId: guestId, userId: null },
        data: { userId: account.userId },
      });
      migratedSessionsCount = diagnostics.count;
    }
    if (values.sessionToken)
      await tx.authSession.deleteMany({ where: { sessionToken: values.sessionToken } });
    await tx.authSession.create({
      data: {
        userId: account.userId,
        sessionToken: token,
        expiresAt: new Date(Date.now() + SESSION_SECONDS * 1000),
      },
    });
    const { id, nickname, email, role } = account.user;
    return {
      token,
      user: { id, nickname, email, role },
      migratedSessionsCount,
      redirectUrl: flow.returnPath,
    };
  });
}
