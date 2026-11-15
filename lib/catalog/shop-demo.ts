import { categories, cosmeticDisclaimer, type ProductRecommendationResponse } from "./types";
import { sampleCatalogProducts } from "./sample-data";

export const skinTypeOptions = ["O", "D"].flatMap((oil) =>
  ["S", "R"].flatMap((sensitive) =>
    ["P", "N"].flatMap((pigment) =>
      ["W", "T"].map((wrinkle) => oil + sensitive + pigment + wrinkle),
    ),
  ),
);
export function describeSkinType(code: string): string {
  return [
    code[0] === "D" ? "건성" : "지성",
    code[1] === "S" ? "민감성" : "저항성",
    code[2] === "P" ? "색소성" : "비색소성",
    code[3] === "W" ? "주름 경향" : "탄력 경향",
  ].join(" · ");
}
export function getShopDemo(code: string): ProductRecommendationResponse {
  const baumannType = skinTypeOptions.includes(code) ? code : "DSNW";
  const ingredients =
    baumannType[0] === "D"
      ? ["세라마이드", "판테놀", "글리세린"]
      : ["병풀추출물", "히알루론산", "판테놀"];
  const names = ["데일리 레이어 토너", "워터 드롭 앰플", "컴포트 배리어 크림", "데일리 선 케어"];
  return {
    reportId: "00000000-0000-4000-8000-000000000000",
    baumannType,
    recommendedIngredients: ingredients,
    disclaimer: cosmeticDisclaimer,
    categories: categories.map((category, i) => {
      const candidates = sampleCatalogProducts.filter(
        (p) => p.category === category.dbCategory && p.suitableBaumannTypes.includes(baumannType),
      );
      const products = candidates.map((p, index) => ({
        id: p.id,
        brandName: "SIKIN CONCEPT · 가상 브랜드",
        productName: `${index ? "라이트 " : ""}${names[i]}`,
        thumbnailUrl: null,
        keyIngredients: [
          ingredients[i % ingredients.length],
          ingredients[(i + 1) % ingredients.length],
        ],
        recommendationReason: `선택한 예시 타입에서 ${ingredients[i % ingredients.length]} 성분 태그로 탐색하는 구성을 보여드립니다. 실제 제품의 성분이나 적합성을 평가한 결과가 아닙니다.`,
        status: "ACTIVE" as const,
        redirectPath: null,
      }));
      return {
        category: category.category,
        categoryNameKo: category.categoryNameKo,
        primaryProduct: products[0] ?? null,
        secondaryProduct: products[1] ?? null,
        isFallbackActive: false,
      };
    }),
  };
}
