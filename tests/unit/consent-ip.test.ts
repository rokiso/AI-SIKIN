// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { consentRequestMetadata } from "@/lib/server/getClientIp";
afterEach(() => vi.unstubAllEnvs());
it("does not treat caller forwarding headers as trustworthy without configured ingress", () => {
  vi.stubEnv("CONSENT_TRUSTED_IP_HEADER", "");
  expect(
    consentRequestMetadata(
      new Headers({ "x-forwarded-for": "203.0.113.20", "x-real-ip": "198.51.100.1" }),
    ),
  ).toMatchObject({ ipAddress: null, ipSource: "UNAVAILABLE" });
});
it("takes only the first valid address from the configured, overwritten header", () => {
  vi.stubEnv("CONSENT_TRUSTED_IP_HEADER", "x-forwarded-for");
  expect(
    consentRequestMetadata(new Headers({ "x-forwarded-for": "203.0.113.20, 198.51.100.1" })),
  ).toMatchObject({ ipAddress: "203.0.113.20", ipSource: "TRUSTED_HEADER" });
  expect(
    consentRequestMetadata(
      new Headers({ "x-forwarded-for": "invalid, 203.0.113.20", "x-real-ip": "198.51.100.1" }),
    ).ipAddress,
  ).toBeNull();
  for (const value of ["127.0.0.1", "::1", "2001:db8::1"])
    expect(consentRequestMetadata(new Headers({ "x-forwarded-for": value })).ipAddress).toBe(value);
});
it("bounds audit metadata and never accepts arbitrary trusted header configuration", () => {
  vi.stubEnv("CONSENT_TRUSTED_IP_HEADER", "x-real-ip");
  const value = consentRequestMetadata(
    new Headers({ "user-agent": "x".repeat(1000), "x-real-ip": "x".repeat(5000) }),
  );
  expect(value.userAgent).toHaveLength(512);
  expect(value.ipAddress).toBeNull();
  vi.stubEnv("CONSENT_TRUSTED_IP_HEADER", "private-untrusted-header");
  expect(() => consentRequestMetadata(new Headers())).toThrow("CONSENT_TRUSTED_IP_HEADER");
});
