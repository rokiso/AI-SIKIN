// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  digest,
  generatePkcePair,
  signStateCookie,
  verifyStateCookie,
  type OAuthPayload,
} from "@/lib/auth/pkce";
import { safeReturnPath } from "@/lib/auth/validation";
import { authorizationUrl, exchangeProfile } from "@/lib/auth/providers";
const now = Date.now();
const flow: OAuthPayload = {
  state: "s".repeat(43),
  verifier: "v".repeat(43),
  provider: "google",
  returnPath: "/mypage",
  expires: now + 300000,
  guestId: null,
};
beforeEach(() => {
  vi.stubEnv("AUTH_COOKIE_SECRET", "test-only-cookie-secret-longer-than-32-characters");
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-secret");
  vi.stubEnv("KAKAO_CLIENT_ID", "test-kakao-client");
  vi.stubEnv("KAKAO_CLIENT_SECRET", "test-kakao-secret");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://sikin.test");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("OAuth security", () => {
  it("matches RFC7636 S256 and produces random 43-character verifier pairs", () => {
    expect(digest("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
    const a = generatePkcePair();
    expect(a.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.codeChallenge).toBe(digest(a.codeVerifier));
    expect(a).not.toEqual(generatePkcePair());
  });
  it("authenticates and encrypts flow cookies, rejects tampering and expiry", () => {
    const cookie = signStateCookie(flow);
    expect(cookie).not.toContain(flow.verifier);
    expect(verifyStateCookie(cookie, now)).toEqual(flow);
    const bytes = Buffer.from(cookie, "base64url");
    bytes[30] ^= 1;
    expect(verifyStateCookie(bytes.toString("base64url"), now)).toBeNull();
    expect(verifyStateCookie(cookie, flow.expires)).toBeNull();
    expect(verifyStateCookie(undefined)).toBeNull();
  });
  it.each([
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "/\nevil.test",
    "/api/v1/auth/logout",
    "/auth/login",
  ])("rejects unsafe return %s", (path) => expect(safeReturnPath(path)).toBe("/"));
  it("preserves internal result query strings", () =>
    expect(safeReturnPath("/diagnostic/result?sessionId=123")).toBe(
      "/diagnostic/result?sessionId=123",
    ));
  it.each(["google", "kakao"] as const)(
    "builds %s authorize URL with matching redirect and PKCE parameters",
    (provider) => {
      const url = new URL(authorizationUrl(provider, flow.state, digest(flow.verifier)));
      expect(url.searchParams.get("state")).toBe(flow.state);
      expect(url.searchParams.get("code_challenge_method")).toBe("S256");
      expect(url.searchParams.get("redirect_uri")).toBe(
        `https://sikin.test/auth/callback/${provider}`,
      );
    },
  );
  it.each(["google", "kakao"] as const)(
    "sends the exact %s token contract and keeps secrets out of authorization URLs",
    async (provider) => {
      const tokens = { google: "test-google-access", kakao: "test-kakao-access" };
      const profile =
        provider === "google"
          ? { sub: "google-id", name: "구글 검증" }
          : { id: 123, kakao_account: { profile: { nickname: "카카오 검증" } } };
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(Response.json({ access_token: tokens[provider] }))
        .mockResolvedValueOnce(Response.json(profile));
      vi.stubGlobal("fetch", fetcher);
      const url = new URL(authorizationUrl(provider, flow.state, digest(flow.verifier)));
      expect(url.searchParams.get("response_type")).toBe("code");
      expect(url.searchParams.get("client_id")).toBe(
        provider === "google" ? "test-client" : "test-kakao-client",
      );
      expect(url.searchParams.get("scope")).toBe(
        provider === "google" ? "openid email profile" : "profile_nickname",
      );
      expect(url.href).not.toContain("test-secret");
      expect(url.searchParams.has("client_secret")).toBe(false);
      const result = await exchangeProfile(provider, "test-code", flow.verifier);
      expect(result.email).toBeNull();
      const [tokenUrl, options] = fetcher.mock.calls[0];
      expect(tokenUrl).toBe(
        provider === "google"
          ? "https://oauth2.googleapis.com/token"
          : "https://kauth.kakao.com/oauth/token",
      );
      expect(options.method).toBe("POST");
      expect(options.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
      expect(Object.fromEntries(new URLSearchParams(String(options.body)))).toEqual({
        grant_type: "authorization_code",
        client_id: provider === "google" ? "test-client" : "test-kakao-client",
        client_secret: provider === "google" ? "test-secret" : "test-kakao-secret",
        redirect_uri: url.searchParams.get("redirect_uri"),
        code: "test-code",
        code_verifier: flow.verifier,
      });
      expect(options.redirect).toBe("error");
      expect(options.cache).toBe("no-store");
      expect(fetcher.mock.calls[1][0]).toBe(
        provider === "google"
          ? "https://openidconnect.googleapis.com/v1/userinfo"
          : "https://kapi.kakao.com/v2/user/me",
      );
      expect(fetcher.mock.calls[1][1].headers.Authorization).toBe(`Bearer ${tokens[provider]}`);
    },
  );
  it("exchanges Google code with verifier and validates a verified provider identity", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ access_token: "test-only-token" }))
      .mockResolvedValueOnce(
        Response.json({
          sub: "google-123",
          name: "지민",
          email: "jimin@example.com",
          email_verified: true,
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    expect(await exchangeProfile("google", "test-code", flow.verifier)).toEqual({
      provider: "google",
      id: "google-123",
      nickname: "지민",
      email: "jimin@example.com",
    });
    const init = fetcher.mock.calls[0][1] as RequestInit;
    expect(String(init.body)).toContain(`code_verifier=${flow.verifier}`);
    expect(fetcher.mock.calls[1][1].headers.Authorization).toBe("Bearer test-only-token");
  });
  it("parses Kakao identity without requiring email consent", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ access_token: "test-only-token" }))
        .mockResolvedValueOnce(
          Response.json({ id: 12345, kakao_account: { profile: { nickname: "카카오 사용자" } } }),
        ),
    );
    expect(await exchangeProfile("kakao", "test-code", flow.verifier)).toEqual({
      provider: "kakao",
      id: "12345",
      nickname: "카카오 사용자",
      email: null,
    });
  });
  it("redacts provider errors and does not trust malformed profiles", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private-client-secret")));
    await expect(exchangeProfile("google", "code", flow.verifier)).rejects.toMatchObject({
      status: 502,
      code: "OAUTH_PROVIDER_ERROR",
    });
  });
});
