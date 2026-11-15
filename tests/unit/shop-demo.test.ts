import { describe, expect, it } from "vitest";
import { getShopDemo, skinTypeOptions, describeSkinType } from "../../lib/catalog/shop-demo";
import { recommendationsSchema } from "../../lib/catalog/types";
describe("clearly fictional shopping catalog", () => {
  it("supports all 16 example types without real purchase links or invented prices", () => {
    expect(skinTypeOptions).toHaveLength(16);
    for (const type of skinTypeOptions) {
      const data = recommendationsSchema.parse(getShopDemo(type));
      expect(data.baumannType).toBe(type);
      expect(data.categories).toHaveLength(4);
      for (const c of data.categories)
        for (const p of [c.primaryProduct, c.secondaryProduct]) {
          expect(p).not.toBeNull();
          expect(p?.brandName).toContain("가상");
          expect(p?.redirectPath).toBeNull();
        }
    }
  });
  it("changes example ingredient sets with type and handles invalid example input safely", () => {
    expect(getShopDemo("OSNW").recommendedIngredients).not.toEqual(
      getShopDemo("DSNW").recommendedIngredients,
    );
    expect(getShopDemo("INVALID").baumannType).toBe("DSNW");
    expect(describeSkinType("DSNW")).toContain("건성");
  });
});
