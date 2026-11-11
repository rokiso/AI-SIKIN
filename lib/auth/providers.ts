import "server-only";
import { z } from "zod";
import { getOAuthConfiguration } from "@/lib/server-env";
import type { Provider } from "./validation";
import { AuthError } from "./response";

const endpoints = {
  google: {
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    profile: "https://openidconnect.googleapis.com/v1/userinfo",
    scope: "openid email profile",
  },
  kakao: {
    authorize: "https://kauth.kakao.com/oauth/authorize",
    token: "https://kauth.kakao.com/oauth/token",
    profile: "https://kapi.kakao.com/v2/user/me",
    scope: "profile_nickname",
  },
};
export function authorizationUrl(provider: Provider, state: string, challenge: string) {
  const config = getOAuthConfiguration(provider);
  const url = new URL(endpoints[provider].authorize);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.callbackUrl,
    response_type: "code",
    scope: endpoints[provider].scope,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return url.href;
}
export interface SocialProfile {
  provider: Provider;
  id: string;
  nickname: string;
  email: string | null;
}
async function jsonRequest(url: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("Provider request failed");
  return response.json() as Promise<unknown>;
}
export async function exchangeProfile(
  provider: Provider,
  code: string,
  verifier: string,
): Promise<SocialProfile> {
  try {
    const config = getOAuthConfiguration(provider);
    const token = z
      .object({ access_token: z.string().min(1), token_type: z.string().optional() })
      .parse(
        await jsonRequest(endpoints[provider].token, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            client_id: config.clientId,
            client_secret: config.clientSecret,
            redirect_uri: config.callbackUrl,
            code,
            code_verifier: verifier,
          }),
        }),
      );
    const raw = await jsonRequest(endpoints[provider].profile, {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (provider === "google") {
      const profile = z
        .object({
          sub: z.string().min(1).max(255),
          name: z.string().max(200).optional(),
          email: z.email().optional(),
          email_verified: z.boolean().optional(),
        })
        .parse(raw);
      return {
        provider,
        id: profile.sub,
        nickname: profile.name?.trim() || "회원",
        email: profile.email_verified ? (profile.email ?? null) : null,
      };
    }
    const profile = z
      .object({
        id: z.number().int().positive().safe(),
        kakao_account: z
          .object({
            profile: z.object({ nickname: z.string().max(200).optional() }).optional(),
            email: z.email().optional(),
            is_email_valid: z.boolean().optional(),
            is_email_verified: z.boolean().optional(),
          })
          .optional(),
      })
      .parse(raw);
    return {
      provider,
      id: String(profile.id),
      nickname: profile.kakao_account?.profile?.nickname?.trim() || "회원",
      email:
        profile.kakao_account?.is_email_valid && profile.kakao_account.is_email_verified
          ? (profile.kakao_account.email ?? null)
          : null,
    };
  } catch {
    throw new AuthError(
      502,
      "OAUTH_PROVIDER_ERROR",
      "소셜 인증 서버와 통신하는 중 오류가 발생했습니다. 다시 로그인해 주세요.",
    );
  }
}
