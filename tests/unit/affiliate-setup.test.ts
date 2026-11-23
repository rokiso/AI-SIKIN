import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { checkAffiliateSetup } from "@/lib/catalog/affiliate-setup";
import { getAffiliatePartnerConfiguration } from "@/lib/server-env";
import { inspectProductManifest } from "@/lib/catalog/product-import";
import { affiliateManifestFixture } from "../fixtures/affiliate-products";
afterEach(() => vi.unstubAllEnvs());
function configure() {
  vi.stubEnv("AFFILIATE_PARTNER_ID", "fixture-issued-partner");
  vi.stubEnv("AFFILIATE_DEFAULT_PLATFORM", "FIXTURE_PLATFORM");
  vi.stubEnv("CATALOG_AFFILIATE_HOSTS", "seller.example.com");
}
it("reports missing configuration without exposing values or claiming partner approval", () => {
  for (const name of [
    "AFFILIATE_PARTNER_ID",
    "AFFILIATE_DEFAULT_PLATFORM",
    "CATALOG_AFFILIATE_HOSTS",
  ])
    vi.stubEnv(name, undefined);
  const result = checkAffiliateSetup();
  expect(result.configurationValid).toBe(false);
  expect(result.invalidFields).toHaveLength(3);
  configure();
  expect(checkAffiliateSetup()).toMatchObject({
    configurationValid: true,
    partnerRegistration: "NOT_VERIFIED",
    providerTrackingContract: "NOT_VERIFIED",
    liveActivation: "NOT_CHANGED",
  });
  vi.stubEnv("AFFILIATE_PARTNER_ID", "secret-fixture-value\ninvalid");
  expect(JSON.stringify(checkAffiliateSetup())).not.toContain("secret-fixture");
  expect(() => getAffiliatePartnerConfiguration()).toThrow(
    "configuration is incomplete or invalid",
  );
});
it("requires all four primary/secondary categories and an operator-declared review", () => {
  configure();
  const good = affiliateManifestFixture();
  expect(inspectProductManifest(good).summary.readyForLocalImport).toBe(true);
  expect(inspectProductManifest({ version: 1, products: [] }).summary.readyForLocalImport).toBe(
    false,
  );
  expect(
    inspectProductManifest({ ...good, products: good.products.slice(1) }).summary
      .readyForLocalImport,
  ).toBe(false);
  good.products[0].affiliatePlatform = "OTHER_PLATFORM";
  expect(inspectProductManifest(good).summary.readyForLocalImport).toBe(false);
  expect(() =>
    inspectProductManifest({ version: 1, products: [{ id: "bad", apiKey: "private" }] }),
  ).toThrow("Product manifest failed validation");
});
it("rejects unsafe or duplicate links, unreviewed copy and inconsistent source review", () => {
  configure();
  for (const url of [
    "http://seller.example.com/x",
    "https://seller.example.com.evil.com/x",
    "https://private:secret@seller.example.com/x",
    "https://seller.example.com/#x",
  ]) {
    const m = affiliateManifestFixture();
    m.products[0].affiliateBaseUrl = url;
    expect(() => inspectProductManifest(m)).toThrow();
  }
  const duplicate = affiliateManifestFixture();
  duplicate.products[1].id = duplicate.products[0].id;
  expect(() => inspectProductManifest(duplicate)).toThrow();
  const copy = affiliateManifestFixture();
  copy.products[0].productName = "피부염 치료";
  expect(() => inspectProductManifest(copy)).toThrow();
  const future = affiliateManifestFixture();
  future.products[0].review.checkedAt = new Date(Date.now() + 86400000).toISOString();
  expect(() => inspectProductManifest(future)).toThrow();
  const invalidSource = affiliateManifestFixture();
  invalidSource.products[0].review.sourceUrl = "not a URL containing private-fixture-value";
  expect(() => inspectProductManifest(invalidSource)).toThrow("Product manifest failed validation");
  const unreviewed = affiliateManifestFixture();
  expect(() =>
    inspectProductManifest({
      ...unreviewed,
      products: unreviewed.products.map((p) => ({
        ...p,
        review: { ...p.review, contentReviewed: false },
      })),
    }),
  ).toThrow();
});
