import "server-only";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { GUEST_COOKIE_NAME } from "./guest";
import { GUEST_PROOF_COOKIE_NAME, verifyGuestProof } from "./guest-proof";
import type { SessionCookieValues, VerifiedIdentity } from "./identity-types";

export const APP_SESSION_COOKIE_NAME = "app_session_token";
const sessionTokenSchema = z.string().regex(/^(?:[a-f0-9]{64}|[A-Za-z0-9_-]{43})$/);

export function readSessionCookies(cookieStore: { get(name: string): { value: string } | undefined }): SessionCookieValues {
  return {
    sessionToken: cookieStore.get(APP_SESSION_COOKIE_NAME)?.value,
    guestId: cookieStore.get(GUEST_COOKIE_NAME)?.value,
    guestProof: cookieStore.get(GUEST_PROOF_COOKIE_NAME)?.value,
  };
}

export async function resolveRequestIdentity(values: SessionCookieValues, now = new Date()): Promise<VerifiedIdentity> {
  const verifiedGuest = verifyGuestProof(values.guestId, values.guestProof, now) ? values.guestId ?? null : null;
  const token = sessionTokenSchema.safeParse(values.sessionToken);
  if (token.success) {
    // The opaque credential is verified against a live database record, not
    // against a client-provided user ID or client session context.
    const session = await getPrisma().authSession.findFirst({
      where: { sessionToken: token.data, expiresAt: { gt: now } },
      select: { user: { select: { id: true, nickname: true, role: true } } },
    });
    if (session) return { kind: "member", userId: session.user.id, nickname: session.user.nickname, role: session.user.role, guestDeviceId: verifiedGuest };
  }
  return verifiedGuest ? { kind: "guest", guestDeviceId: verifiedGuest } : { kind: "anonymous" };
}
