import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  AuthError,
  authFailure,
  privateHeaders,
  requireSameOrigin,
  sessionCookieOptions,
} from "@/lib/auth/response";
import { readSessionCookies, resolveRequestIdentity } from "@/lib/session/identity";
import {
  createGuestSession,
  guestSessionMetadata,
  GUEST_PROOF_COOKIE_NAME,
} from "@/lib/session/guest-proof";
import { GUEST_COOKIE_NAME } from "@/lib/session/guest";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const reader = request.body?.getReader();
    if (reader) {
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          if (chunk.value.byteLength > 0) {
            await reader.cancel();
            throw new AuthError(
              400,
              "INVALID_GUEST_SESSION_REQUEST",
              "요청 본문 없이 다시 시도해 주세요.",
            );
          }
        }
      } finally {
        reader.releaseLock();
      }
    }
    const values = readSessionCookies(await cookies());
    const now = new Date();
    if ((await resolveRequestIdentity(values, now)).kind === "member")
      throw new AuthError(
        409,
        "GUEST_SESSION_NOT_REQUIRED",
        "이미 로그인되어 있습니다. 현재 계정으로 계속해 주세요.",
      );
    const previous = guestSessionMetadata(values.guestId, values.guestProof, now);
    const session =
      previous && values.guestId && values.guestProof
        ? { guestDeviceId: values.guestId, proof: values.guestProof }
        : createGuestSession(now);
    const metadata = previous ?? guestSessionMetadata(session.guestDeviceId, session.proof, now);
    if (!metadata) throw new Error("Guest session metadata unavailable");
    const response = NextResponse.json(
      { success: true, data: { guestDeviceId: session.guestDeviceId, ...metadata } },
      { status: previous ? 200 : 201, headers: privateHeaders },
    );
    const options = { ...sessionCookieOptions, maxAge: metadata.expiresInSeconds };
    response.cookies.set(GUEST_COOKIE_NAME, session.guestDeviceId, options);
    response.cookies.set(GUEST_PROOF_COOKIE_NAME, session.proof, options);
    return response;
  } catch (error) {
    return authFailure(error);
  }
}
