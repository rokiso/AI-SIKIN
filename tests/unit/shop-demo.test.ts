import { describe, expect, it } from "vitest";
import {
  getShopDemo,
  skinTypeOptions,
  describeSkinType,
  matchesShoppingConcerns,
} from "../../lib/catalog/shop-demo";
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
  it("supports combination browsing without inventing a new diagnosis code", () => {
    const combination = recommendationsSchema.parse(getShopDemo("DSNW", "COMBINATION"));
    expect(combination.baumannType).toBe("DSNW");
    expect(combination.recommendedIngredients).toContain("히알루론산");
    expect(combination.recommendedIngredients).toContain("나이아신아마이드");
    expect(describeSkinType("DSPW")).toContain("색소침착 고민");
    expect(describeSkinType("DSNW")).toContain("색소침착 고민 적음");
    expect(describeSkinType("DSNW")).not.toContain("비색소성");
    for (const c of combination.categories)
      for (const p of [c.primaryProduct, c.secondaryProduct]) {
        expect(p?.keyIngredients.some((name) => p.recommendationReason.includes(name))).toBe(true);
      }
  });
  it("filters pigment and pore interests by ingredient tags without making efficacy claims", () => {
    expect(matchesShoppingConcerns(["판테놀"], ["TROUBLE"])).toBe(true);
    expect(matchesShoppingConcerns(["세라마이드"], ["TROUBLE"])).toBe(false);
    expect(matchesShoppingConcerns(["세라마이드"], [])).toBe(true);
    expect(matchesShoppingConcerns(["세라마이드"], ["PORES"])).toBe(false);
    expect(matchesShoppingConcerns(["나이아신아마이드"], ["PORES", "PIGMENTATION"])).toBe(true);
    expect(matchesShoppingConcerns(["살리실릭애씨드"], ["PORES"])).toBe(true);
    expect(matchesShoppingConcerns(["살리실릭애씨드"], ["PIGMENTATION"])).toBe(false);
  });
});
