import { getPrisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { readSessionCookies, APP_SESSION_COOKIE_NAME } from "@/lib/session/identity";
import { exchangeProfile } from "@/lib/auth/providers";
import { digest, OAUTH_COOKIE, verifyStateCookie } from "@/lib/auth/pkce";
import { invalidState, provisionSession, SESSION_SECONDS } from "@/lib/auth/session";
import { callbackSchema, providerSchema } from "@/lib/auth/validation";
import {
  authFailure,
  privateHeaders,
  requireSameOrigin,
  sessionCookieOptions,
  smallJson,
} from "@/lib/auth/response";
import { GUEST_COOKIE_NAME } from "@/lib/session/guest";
import { GUEST_PROOF_COOKIE_NAME } from "@/lib/session/guest-proof";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ provider: string }> }) {
  try {
    requireSameOrigin(request);
    const provider = providerSchema.safeParse((await context.params).provider);
    const input = callbackSchema.safeParse(await smallJson(request));
    const store = await cookies();
    const flow = verifyStateCookie(store.get(OAUTH_COOKIE)?.value);
    if (
      !provider.success ||
      !input.success ||
      !flow ||
      provider.data !== flow.provider ||
      input.data.state !== flow.state
    )
      invalidState();
    const attempt = await getPrisma().oAuthAttempt.findUnique({
      where: { stateHash: digest(flow.state) },
    });
    if (!attempt || attempt.expiresAt.getTime() <= Date.now()) invalidState();
    const profile = await exchangeProfile(provider.data, input.data.code, flow.verifier);
    const result = await provisionSession(profile, flow, readSessionCookies(store));
    const { token, ...data } = result;
    const response = NextResponse.json({ success: true, data }, { headers: privateHeaders });
    response.cookies.set(APP_SESSION_COOKIE_NAME, token, {
      ...sessionCookieOptions,
      maxAge: SESSION_SECONDS,
    });
    response.cookies.set(OAUTH_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 });
    // Rotate the guest capability after ownership transfer; old guest data is now member-only.
    for (const name of [GUEST_COOKIE_NAME, GUEST_PROOF_COOKIE_NAME])
      response.cookies.set(name, "", { ...sessionCookieOptions, maxAge: 0 });
    return response;
  } catch (error) {
    const response = authFailure(error);
    response.cookies.set(OAUTH_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 });
    return response;
  }
}
