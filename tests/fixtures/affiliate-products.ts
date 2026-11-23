import { randomUUID } from "node:crypto";
import { categories } from "../../lib/catalog/types";
// Fictional input for validation tests only; no public catalog seed or network requests.
export function affiliateManifestFixture() {
  return {
    version: 1,
    products: categories.flatMap((c) =>
      (["PRIMARY", "SECONDARY"] as const).map((tier) => ({
        id: randomUUID(),
        brandName: "등록 검증용 가상 브랜드",
        productName: `검증용 ${c.category} ${tier}`,
        category: c.category,
        tier,
        suitableBaumannTypes: ["OSNW"],
        fullIngredients: "정제수, 판테놀",
        keyIngredients: ["판테놀"],
        affiliateBaseUrl: `https://seller.example.com/item/${randomUUID()}?partner=operator-issued`,
        affiliatePlatform: "FIXTURE_PLATFORM",
        thumbnailUrl: null,
        review: {
          sourceUrl: "https://manufacturer.example.com/label",
          checkedAt: new Date(Date.now() - 1000).toISOString(),
          contentReviewed: true,
          imageRightsConfirmed: true,
        },
      })),
    ),
  };
}
