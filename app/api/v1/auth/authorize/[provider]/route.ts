import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { readSessionCookies } from "@/lib/session/identity";
import { verifyGuestProof } from "@/lib/session/guest-proof";
import { authorizationUrl } from "@/lib/auth/providers";
import {
  digest,
  FLOW_SECONDS,
  generatePkcePair,
  OAUTH_COOKIE,
  signStateCookie,
} from "@/lib/auth/pkce";
import { providerSchema, safeReturnPath } from "@/lib/auth/validation";
import { AuthError, authFailure, privateHeaders, sessionCookieOptions } from "@/lib/auth/response";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ provider: string }> }) {
  try {
    const parsed = providerSchema.safeParse((await context.params).provider);
    if (!parsed.success)
      throw new AuthError(400, "INVALID_PROVIDER", "지원하지 않는 로그인 방법입니다.");
    if (request.headers.get("sec-fetch-site") === "cross-site")
      throw new AuthError(403, "FORBIDDEN_REQUEST", "사이트에서 로그인을 다시 시작해 주세요.");
    const state = randomBytes(32).toString("base64url");
    const pair = generatePkcePair();
    const url = authorizationUrl(parsed.data, state, pair.codeChallenge);
    const values = readSessionCookies(await cookies());
    if (!verifyGuestProof(values.guestId, values.guestProof) || !values.guestId)
      throw new AuthError(401, "SESSION_REQUIRED", "페이지를 새로고침한 뒤 다시 로그인해 주세요.");
    const flow = {
      state,
      verifier: pair.codeVerifier,
      provider: parsed.data,
      returnPath: safeReturnPath(new URL(request.url).searchParams.get("redirect_url")),
      expires: Date.now() + FLOW_SECONDS * 1000,
      guestId: verifyGuestProof(values.guestId, values.guestProof)
        ? (values.guestId ?? null)
        : null,
    };
    const encrypted = signStateCookie(flow);
    const ownerHash = digest(values.guestId);
    await getPrisma().$transaction(async (tx) => {
      const lock = `oauth-start:${ownerHash}`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lock}, 0))::text`;
      await tx.oAuthAttempt.deleteMany({ where: { ownerHash, expiresAt: { lte: new Date() } } });
      if ((await tx.oAuthAttempt.count({ where: { ownerHash } })) >= 10)
        throw new AuthError(
          429,
          "AUTH_RATE_LIMIT",
          "로그인 요청이 많습니다. 5분 뒤 다시 시도해 주세요.",
        );
      await tx.oAuthAttempt.create({
        data: { ownerHash, stateHash: digest(state), expiresAt: new Date(flow.expires) },
      });
    });
    const response = NextResponse.json(
      { success: true, data: { authorizationUrl: url } },
      { headers: privateHeaders },
    );
    response.cookies.set(OAUTH_COOKIE, encrypted, {
      ...sessionCookieOptions,
      maxAge: FLOW_SECONDS,
    });
    return response;
  } catch (error) {
    return authFailure(error);
  }
}
