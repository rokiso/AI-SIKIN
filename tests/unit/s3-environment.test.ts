// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { getVaultConfiguration } from "@/lib/server-env";
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("S3_VAULT_BUCKET", "test-private-vault");
  vi.stubEnv("S3_VAULT_REGION", "ap-northeast-2");
  vi.stubEnv("AWS_ACCESS_KEY_ID", "test-key-not-real");
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", "test-secret-not-real");
  vi.stubEnv("S3_ENDPOINT", "");
});
afterEach(() => vi.unstubAllEnvs());
describe("private storage environment validation", () => {
  it.each(["S3_VAULT_BUCKET", "S3_VAULT_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"])(
    "rejects missing and example-only %s without revealing its value",
    (name) => {
      for (const value of ["", "replace-with-private-example"]) {
        vi.stubEnv(name, value);
        expect(() => getVaultConfiguration()).toThrow(
          "Image storage configuration is missing or invalid",
        );
        expect(() => getVaultConfiguration()).toThrow(name);
      }
    },
  );
  it.each([
    "https://user:private@example.com",
    "https://example.com?secret=private",
    "https://example.com/#private",
    "http://storage.example.com",
  ])("rejects an unsafe storage endpoint %s", (endpoint) => {
    vi.stubEnv("S3_ENDPOINT", endpoint);
    expect(() => getVaultConfiguration()).toThrow(
      "Image storage configuration is missing or invalid",
    );
  });
  it("keeps local HTTP test support but requires HTTPS in production", () => {
    vi.stubEnv("S3_ENDPOINT", "http://127.0.0.1:9000");
    expect(getVaultConfiguration().endpoint).toBe("http://127.0.0.1:9000");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => getVaultConfiguration()).toThrow(
      "Image storage configuration is missing or invalid",
    );
    vi.stubEnv("S3_ENDPOINT", "https://storage.example.com");
    expect(getVaultConfiguration().endpoint).toBe("https://storage.example.com");
  });
});
