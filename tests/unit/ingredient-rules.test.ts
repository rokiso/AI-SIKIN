import { describe, expect, it } from "vitest";
import {
  analyzeIngredients,
  assertIngredientCopy,
  defaultIngredientRules,
  ingredientMatches,
  parseFullIngredients,
  validateIngredientDefinitions,
} from "@/lib/catalog/ingredient-rules";
import { matchProducts } from "@/lib/catalog/matching";
import { sampleCatalogProducts } from "@/lib/catalog/sample-data";
import type { Product } from "@/generated/prisma/client";
describe("ingredient projection and caution rules", () => {
  it("preserves label order and numeric locants, including duplicates", () => {
    expect(parseFullIngredients(" 정제수，1,2-헥산다이올, 판테놀;Alcohol Denat.\n정제수")).toEqual([
      "정제수",
      "1,2-헥산다이올",
      "판테놀",
      "Alcohol Denat.",
      "정제수",
    ]);
  });
  it.each([
    "변성알코올",
    "Alcohol Denat.",
    " Alcohol   Denat ",
    "에탄올",
    "변성알코올 (Alcohol Denat.)",
  ])("recognizes exact alcohol alias %s", (label) => {
    const result = analyzeIngredients([label], "OSNW", defaultIngredientRules);
    expect(result.cautionIngredients.map((r) => r.nameKo)).toContain("변성알코올");
    expect(analyzeIngredients([label], "ORNT", defaultIngredientRules).cautionIngredients).toEqual(
      [],
    );
  });
  it.each([
    "세테아릴알코올",
    "Cetearyl Alcohol",
    "Cetyl Alcohol",
    "Behenyl Alcohol",
    "Alcohol-Free",
  ])("does not confuse %s with volatile alcohol", (label) => {
    expect(analyzeIngredients([label], "DSNW", defaultIngredientRules).cautionIngredients).toEqual(
      [],
    );
  });
  it("applies dry and sensitive axes separately without inferring acid concentrations", () => {
    expect(
      analyzeIngredients(["SLS"], "DRNT", defaultIngredientRules).cautionIngredients[0].matchedAxis,
    ).toBe("DRY");
    expect(analyzeIngredients(["SLS"], "ORNT", defaultIngredientRules).cautionIngredients).toEqual(
      [],
    );
    const acid = analyzeIngredients(["Salicylic Acid"], "DSNT", defaultIngredientRules)
      .cautionIngredients[0];
    expect(acid.reasonKo).toContain("알 수 없으므로");
    expect(acid.reasonKo).not.toContain("고농도");
  });
  it("leaves unknown skin types at common rules and distinguishes family names from specific ingredients", () => {
    const result = analyzeIngredients(
      ["세라마이드", "히알루론산", "Panthenol"],
      null,
      defaultIngredientRules,
      ["판테놀"],
    );
    expect(result.cautionIngredients).toEqual([]);
    expect(result.beneficialIngredients.map((r) => r.nameKo)).toEqual(
      expect.arrayContaining(["세라마이드", "히알루론산", "판테놀"]),
    );
    expect(result.beneficialIngredients.some((r) => r.nameKo === "세라마이드엔피")).toBe(false);
    expect(result.beneficialIngredients.find((r) => r.nameKo === "판테놀")?.isTargetMatched).toBe(
      true,
    );
  });
  it("does not match partial ingredient names", () => {
    expect(ingredientMatches("소듐라우레스설페이트", ["소듐라우릴설페이트"])).toBe(false);
    expect(ingredientMatches("판테놀유사표기", ["판테놀"])).toBe(false);
  });
  it.each(["여드름 치료", "아토피 완치", "피부 질환 개선", "부작용 없음", "무자극 보장"])(
    "rejects therapeutic or absolute copy %s",
    (text) => expect(() => assertIngredientCopy(text)).toThrow(),
  );
  it("validates shipped descriptions", () =>
    expect(() => validateIngredientDefinitions()).not.toThrow());
  it("excludes type-specific cautions and report aliases from recommendations", () => {
    const products: Product[] = sampleCatalogProducts.map((p, i) => ({
      ...p,
      fullIngredients: i === 0 ? "판테놀, Alcohol Denat." : p.fullIngredients,
      isActive: true,
      thumbnailUrl: null,
      status: "ACTIVE",
      healthCheckFailCount: 0,
      lastCheckedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    const selected = matchProducts(products, {
      baumannType: "OSNW",
      recommendedIngredients: ["판테놀"],
      cautionIngredients: [],
    });
    expect(selected[0].primary?.product.id).not.toBe(products[0].id);
    const aliases = products.map((p) => ({ ...p, fullIngredients: "판테놀, Parfum" }));
    expect(
      matchProducts(aliases, {
        baumannType: "ORNT",
        recommendedIngredients: ["판테놀"],
        cautionIngredients: ["향료"],
      }).every((c) => !c.primary),
    ).toBe(true);
  });
});
