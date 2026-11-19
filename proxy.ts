import { NextResponse, type NextRequest } from "next/server";
import { GUEST_COOKIE_MAX_AGE, GUEST_COOKIE_NAME } from "@/lib/session/guest";
import { APP_SESSION_COOKIE_NAME, resolveRequestIdentity } from "@/lib/session/identity";
import { authFailure, sessionCookieOptions } from "@/lib/auth/response";
import {
  createGuestSession,
  GUEST_PROOF_COOKIE_NAME,
  verifyGuestProof,
} from "@/lib/session/guest-proof";

// Next.js 16 names the request middleware entry point `proxy.ts`.
export async function proxy(request: NextRequest) {
  const token = request.cookies.get(APP_SESSION_COOKIE_NAME)?.value;
  let member = false;
  if (token) {
    try {
      member = (await resolveRequestIdentity({ sessionToken: token })).kind === "member";
    } catch (error) {
      return authFailure(error);
    }
  }
  const existingId = request.cookies.get(GUEST_COOKIE_NAME)?.value;
  const existingProof = request.cookies.get(GUEST_PROOF_COOKIE_NAME)?.value;
  const valid = verifyGuestProof(existingId, existingProof);
  const session = member
    ? null
    : valid && existingId && existingProof
      ? { guestDeviceId: existingId, proof: existingProof }
      : createGuestSession();

  // Forward the server-chosen cookie on the first request too. A caller's raw
  // header must not override the cookie or become a claimed authenticated user.
  if (session) {
    request.cookies.set(GUEST_COOKIE_NAME, session.guestDeviceId);
    request.cookies.set(GUEST_PROOF_COOKIE_NAME, session.proof);
  } else {
    request.cookies.delete(GUEST_COOKIE_NAME);
    request.cookies.delete(GUEST_PROOF_COOKIE_NAME);
  }
  const headers = new Headers(request.headers);
  headers.delete(GUEST_COOKIE_NAME);
  headers.delete(GUEST_PROOF_COOKIE_NAME);
  headers.set("cookie", request.cookies.toString());

  const response = NextResponse.next({ request: { headers } });
  if (member && (existingId || existingProof)) {
    for (const name of [GUEST_COOKIE_NAME, GUEST_PROOF_COOKIE_NAME])
      response.cookies.set(name, "", { ...sessionCookieOptions, maxAge: 0 });
  } else if (!valid && session) {
    response.cookies.set(GUEST_COOKIE_NAME, session.guestDeviceId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: GUEST_COOKIE_MAX_AGE,
    });
    response.cookies.set(GUEST_PROOF_COOKIE_NAME, session.proof, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: GUEST_COOKIE_MAX_AGE,
    });
  }
  // Session-bearing HTML and health responses must not be shared across visitors.
  // Proxy response headers override route headers. Preserve SSE's no-transform
  // directive so intermediaries cannot buffer/compress the progress stream.
  const progressStream = request.nextUrl.pathname.startsWith("/api/v1/diagnostics/progress/");
  response.headers.set(
    "Cache-Control",
    progressStream ? "private, no-cache, no-store, no-transform" : "private, no-store",
  );
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|sw.js|icons/).*)",
  ],
};
