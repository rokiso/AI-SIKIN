import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { isAffiliateUrlAllowed, trackedAffiliateUrl } from "../../lib/catalog/affiliate-url";
import { isPublicAddress, probeAffiliateLink } from "../../lib/catalog/linkHealthChecker";
afterEach(() => vi.unstubAllEnvs());
describe("approved affiliate destinations", () => {
  it("allows exact HTTPS sellers, replaces tracking and omits personal identifiers", () => {
    vi.stubEnv("CATALOG_AFFILIATE_HOSTS", "shop.example.com");
    const url = new URL(
      trackedAffiliateUrl(
        "https://shop.example.com/item?partner=registered&utm_source=old&reportId=private&userId=private",
        "public-random-click",
      ),
    );
    expect(url.searchParams.get("partner")).toBe("registered");
    expect(url.searchParams.getAll("utm_source")).toEqual(["aiskin"]);
    expect(url.searchParams.get("utm_campaign")).toBe("report_curation");
    expect(url.searchParams.get("click_id")).toBe("public-random-click");
    expect(url.href).not.toContain("private");
  });
  it("blocks unconfigured hosts, credentials, open redirects, local addresses and non-HTTPS URLs", async () => {
    vi.stubEnv("CATALOG_AFFILIATE_HOSTS", "shop.example.com,localhost,127.0.0.1,example.invalid");
    for (const value of [
      "https://evil.example.com/",
      "https://shop.example.com.evil.com",
      "http://shop.example.com",
      "javascript:alert(1)",
      "https://user:pass@shop.example.com/",
      "https://shop.example.com:8080/",
      "https://localhost/",
      "https://127.0.0.1/",
      "https://example.invalid/",
      "https://shop.example.com/#private",
    ])
      expect(isAffiliateUrlAllowed(value)).toBe(false);
    expect(await probeAffiliateLink("http://127.0.0.1/private")).toBe(false);
    vi.stubEnv("CATALOG_AFFILIATE_HOSTS", "");
    expect(isAffiliateUrlAllowed("https://shop.example.com/")).toBe(false);
  });
  it("rejects private DNS answers including mapped IPv4 and IPv6 loopback", () => {
    for (const ip of [
      "127.0.0.1",
      "10.0.0.1",
      "172.16.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "::1",
      "::ffff:127.0.0.1",
      "fe80::1",
      "fc00::1",
      "2001:db8::1",
    ])
      expect(isPublicAddress(ip)).toBe(false);
    expect(isPublicAddress("8.8.8.8")).toBe(true);
    expect(isPublicAddress("2606:4700:4700::1111")).toBe(true);
  });
});
