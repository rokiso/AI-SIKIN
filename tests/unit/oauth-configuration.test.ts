// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { getOAuthConfiguration, OAuthConfigurationError } from "@/lib/server-env";
import { checkOAuthSetup } from "@/lib/auth/setup-check";

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://miruvia.test/");
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-google-client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "private-google-test-marker");
  vi.stubEnv("KAKAO_CLIENT_ID", "test-kakao-client");
  vi.stubEnv("KAKAO_CLIENT_SECRET", "private-kakao-test-marker");
  vi.stubEnv("GOOGLE_REDIRECT_URI", "");
  vi.stubEnv("KAKAO_REDIRECT_URI", "");
});
afterEach(() => vi.unstubAllEnvs());
describe("OAuth runtime configuration and private readiness", () => {
  it.each(["google", "kakao"] as const)(
    "normalizes %s origin and derives the browser callback",
    (provider) => {
      const config = getOAuthConfiguration(provider);
      expect(config.appUrl).toBe("https://miruvia.test");
      expect(config.callbackUrl).toBe(`https://miruvia.test/auth/callback/${provider}`);
      vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://miruvia.test");
      expect(getOAuthConfiguration(provider)).toEqual(config);
    },
  );
  it.each([
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "KAKAO_CLIENT_ID",
    "KAKAO_CLIENT_SECRET",
  ] as const)("rejects missing and template-only %s without retaining its value", (field) => {
    const provider = field.startsWith("GOOGLE") ? "google" : "kakao";
    for (const value of [
      "",
      "replace-with-client",
      "your_client_secret_here",
      "changeme",
      "undefined",
      "null",
      " private-marker ",
    ]) {
      vi.stubEnv(field, value);
      try {
        getOAuthConfiguration(provider);
        throw new Error("Expected rejection");
      } catch (error) {
        expect(error).toBeInstanceOf(OAuthConfigurationError);
        expect(error).toMatchObject({ invalidFields: [field] });
        const serialized = `${String(error)} ${JSON.stringify(error)}`;
        expect(serialized).not.toContain("private-marker");
        expect(serialized).not.toContain("your_client_secret_here");
      }
    }
  });
  it.each([
    "https://user:private-url-marker@example.test",
    "https://miruvia.test/path",
    "https://miruvia.test?token=private-url-marker",
    "https://miruvia.test/#private-url-marker",
    "http://miruvia.test",
    "https://your-app.example",
    "not-a-url",
  ])("rejects an invalid origin without reflecting input (%#)", (origin) => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", origin);
    expect(() => getOAuthConfiguration("google")).toThrow("NEXT_PUBLIC_APP_URL");
    try {
      getOAuthConfiguration("google");
    } catch (error) {
      expect(String(error)).not.toContain("private-url-marker");
    }
  });
  it("permits development loopback but requires HTTPS in production", () => {
    for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
      vi.stubEnv("NEXT_PUBLIC_APP_URL", `http://${host}:3000`);
      expect(getOAuthConfiguration("google").callbackUrl).toBe(
        `http://${host}:3000/auth/callback/google`,
      );
    }
    vi.stubEnv("NODE_ENV", "production");
    expect(() => getOAuthConfiguration("google")).toThrow("NEXT_PUBLIC_APP_URL");
  });
  it.each(["google", "kakao"] as const)(
    "rejects mismatched %s redirects instead of silently ignoring them",
    (provider) => {
      const key = `${provider.toUpperCase()}_REDIRECT_URI`;
      for (const uri of [
        `https://other.test/auth/callback/${provider}`,
        `https://miruvia.test/api/v1/auth/callback/${provider}`,
        "${NEXT_PUBLIC_APP_URL}/auth/callback/google",
        `https://miruvia.test/auth/callback/${provider}/`,
      ]) {
        vi.stubEnv(key, uri);
        expect(() => getOAuthConfiguration(provider)).toThrow(key);
      }
      vi.stubEnv(key, `https://miruvia.test/auth/callback/${provider}`);
      expect(getOAuthConfiguration(provider).callbackUrl).toBe(
        `https://miruvia.test/auth/callback/${provider}`,
      );
    },
  );
  it("checks each provider independently, exposes names only and never claims live verification", () => {
    const valid = checkOAuthSetup();
    expect(valid.environmentValid).toBe(true);
    expect(valid).toMatchObject({
      scope: "LOCAL_ENVIRONMENT_ONLY",
      consoleRegistration: "NOT_VERIFIED",
      liveTokenExchange: "NOT_VERIFIED",
      kakaoPkceEnforcement: "NOT_VERIFIED",
    });
    expect(JSON.stringify(valid)).not.toContain("private-");
    expect(JSON.stringify(valid)).not.toContain("test-google-client");
    vi.stubEnv("KAKAO_CLIENT_SECRET", "");
    const result = checkOAuthSetup();
    expect(result.environmentValid).toBe(false);
    expect(result.providers[0].environmentValid).toBe(true);
    expect(result.providers[1]).toMatchObject({
      environmentValid: false,
      callbackUrl: null,
      invalidFields: ["KAKAO_CLIENT_SECRET"],
    });
  });
  it("does not cache credentials or mask rotation errors", () => {
    expect(getOAuthConfiguration("google").clientSecret).toBe("private-google-test-marker");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    expect(() => getOAuthConfiguration("google")).toThrow("GOOGLE_CLIENT_SECRET");
  });
});
