import { NextResponse, type NextRequest } from "next/server";
import { GUEST_COOKIE_MAX_AGE, GUEST_COOKIE_NAME } from "@/lib/session/guest";
import { createGuestSession, GUEST_PROOF_COOKIE_NAME, verifyGuestProof } from "@/lib/session/guest-proof";

// Next.js 16 names the request middleware entry point `proxy.ts`.
export function proxy(request: NextRequest) {
  const existingId = request.cookies.get(GUEST_COOKIE_NAME)?.value;
  const existingProof = request.cookies.get(GUEST_PROOF_COOKIE_NAME)?.value;
  const valid = verifyGuestProof(existingId, existingProof);
  const session = valid && existingId && existingProof ? { guestDeviceId: existingId, proof: existingProof } : createGuestSession();
  const { guestDeviceId, proof } = session;

  // Forward the server-chosen cookie on the first request too. A caller's raw
  // header must not override the cookie or become a claimed authenticated user.
  request.cookies.set(GUEST_COOKIE_NAME, guestDeviceId);
  request.cookies.set(GUEST_PROOF_COOKIE_NAME, proof);
  const headers = new Headers(request.headers);
  headers.delete(GUEST_COOKIE_NAME);
  headers.delete(GUEST_PROOF_COOKIE_NAME);
  headers.set("cookie", request.cookies.toString());

  const response = NextResponse.next({ request: { headers } });
  if (!valid) {
    response.cookies.set(GUEST_COOKIE_NAME, guestDeviceId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: GUEST_COOKIE_MAX_AGE,
    });
    response.cookies.set(GUEST_PROOF_COOKIE_NAME, proof, {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: GUEST_COOKIE_MAX_AGE,
    });
  }
  // Session-bearing HTML and health responses must not be shared across visitors.
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|sw.js|icons/).*)"],
};
