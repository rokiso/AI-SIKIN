import { describe, expect, it } from "vitest";
import type { Product } from "../../generated/prisma/client";
import { sampleCatalogProducts } from "../../lib/catalog/sample-data";
import { matchProducts, recommendationReason } from "../../lib/catalog/matching";
const products: Product[] = sampleCatalogProducts.map((p) => ({
  ...p,
  isActive: true,
  thumbnailUrl: null,
  status: "ACTIVE",
  healthCheckFailCount: 0,
  lastCheckedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}));
describe("catalog ingredient matching", () => {
  for (const oil of ["O", "D"])
    for (const sensitive of ["S", "R"])
      for (const pigment of ["P", "N"])
        for (const wrinkle of ["W", "T"]) {
          const baumannType = oil + sensitive + pigment + wrinkle;
          it(`maps four primary and secondary choices for ${baumannType}`, () => {
            const choices = matchProducts(products, {
              baumannType,
              recommendedIngredients: ["판테놀"],
              cautionIngredients: [],
            });
            expect(choices).toHaveLength(4);
            for (const choice of choices) {
              expect(choice.primary?.product.isPrimary).toBe(true);
              expect(choice.secondary?.product.isPrimary).toBe(false);
              expect(choice.primary?.product.id).not.toBe(choice.secondary?.product.id);
              expect(choice.primary?.targets).toEqual(["판테놀"]);
            }
          });
        }
  it("excludes caution ingredients, inactive products and unmatched ingredient claims", () => {
    expect(
      matchProducts(products, {
        baumannType: "OSNW",
        recommendedIngredients: ["판테놀"],
        cautionIngredients: [" 세라 마이드 "],
      }).every((c) => !c.primary && !c.secondary),
    ).toBe(true);
    expect(
      matchProducts(
        products.map((p) => ({ ...p, isActive: false })),
        { baumannType: "OSNW", recommendedIngredients: [], cautionIngredients: [] },
      ).every((c) => !c.primary),
    ).toBe(true);
    expect(
      matchProducts(products, {
        baumannType: "OSNW",
        recommendedIngredients: ["미포함성분"],
        cautionIngredients: [],
      }).every((c) => !c.primary),
    ).toBe(true);
  });
  it("retains stock status for fallback mapping without generating therapeutic claims", () => {
    const choices = matchProducts(
      products.map((p) => (p.isPrimary ? { ...p, status: "OUT_OF_STOCK" } : p)),
      { baumannType: "OSNW", recommendedIngredients: ["판테놀"], cautionIngredients: [] },
    );
    for (const c of choices) {
      expect(c.primary?.product.status).toBe("OUT_OF_STOCK");
      expect(c.secondary?.product.status).toBe("ACTIVE");
    }
    expect(recommendationReason(["질병 치료", "피부 재생"])).not.toMatch(/치료|재생/);
    expect(recommendationReason(["판테놀"])).not.toMatch(/치료|재생|완치|무자극/);
  });
});
