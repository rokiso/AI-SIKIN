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
