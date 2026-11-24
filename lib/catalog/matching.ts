import type { Product } from "@/generated/prisma/client";
import { categories } from "./types";
import {
  analyzeIngredients,
  defaultIngredientRules,
  ingredientMatches,
  parseFullIngredients,
  type IngredientRule,
} from "./ingredient-rules";
const normalize = (text: string) => text.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
export function matchProducts(
  products: Product[],
  report: { baumannType: string; recommendedIngredients: string[]; cautionIngredients: string[] },
  rules: IngredientRule[] = defaultIngredientRules,
) {
  const cautions = report.cautionIngredients.filter((name) => normalize(name));
  const eligible = products.filter((p) => {
    if (!p.isActive || !p.suitableBaumannTypes.includes(report.baumannType)) return false;
    const ingredients = [
      ...p.ingredients,
      ...parseFullIngredients(p.fullIngredients),
      ...p.keyIngredients,
    ];
    const detected = analyzeIngredients(ingredients, report.baumannType, rules).cautionIngredients;
    return (
      !detected.some((rule) => rule.level !== "INFO") &&
      !cautions.some((ingredient) => {
        const rule = rules.find((rule) =>
          ingredientMatches(ingredient, [rule.standardName, rule.inciName ?? "", ...rule.aliases]),
        );
        return ingredients.some((label) =>
          ingredientMatches(
            label,
            rule ? [rule.standardName, rule.inciName ?? "", ...rule.aliases] : [ingredient],
          ),
        );
      })
    );
  });
  return categories.map((category) => {
    const sorted = eligible
      .filter((p) => p.category === category.dbCategory)
      .map((product) => {
        const ingredients = normalize([...product.ingredients, product.fullIngredients].join(","));
        const targets = report.recommendedIngredients.filter(
          (name) => normalize(name) && ingredients.includes(normalize(name)),
        );
        return { product, targets };
      })
      .filter(({ targets }) => !report.recommendedIngredients.length || targets.length > 0)
      .sort(
        (a, b) =>
          Number(b.product.isPrimary) - Number(a.product.isPrimary) ||
          b.targets.length - a.targets.length ||
          a.product.id.localeCompare(b.product.id),
      );
    const [primary, ...alternatives] = sorted;
    const secondary =
      alternatives.find(({ product }) => product.status === "ACTIVE") ?? alternatives[0];
    return { ...category, primary: primary ?? null, secondary: secondary ?? null };
  });
}
export function safeIngredientLabels(names: string[]): string[] {
  return names.filter(
    (name) => name.length <= 80 && !/치료|재생|완치|질병|의약|무자극|[\x00-\x1f]/.test(name),
  );
}
export function recommendationReason(targets: string[]): string {
  targets = safeIngredientLabels(targets);
  // Data-derived, non-therapeutic wording; never reuse unreviewed seller claims.
  return targets.length
    ? `추천 성분 ${targets.slice(0, 3).join("·")}을 포함해 성분 기준으로 골랐어요.`
    : "리포트의 피부 타입 태그를 기준으로 골랐어요.";
}
