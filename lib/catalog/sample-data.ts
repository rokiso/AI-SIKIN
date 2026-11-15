// Fictional, inactive fixtures only. Never represent verified retail products.
const productCategories = ["TONER", "SERUM", "CREAM", "SUNCARE"] as const;
const labels = ["토너", "앰플", "크림", "자외선 차단제"];
const profiles = ["OS", "OR", "DS", "DR"];
export const sampleCatalogProducts = Array.from({ length: 32 }, (_, index) => {
  const categoryIndex = index % 4;
  const profile = profiles[Math.floor(index / 8)];
  return {
    id: `00000000-0000-4000-8000-${String(index + 201).padStart(12, "0")}`,
    brandName: "개발용 가상 브랜드",
    productName: `[개발 샘플] ${profile} ${labels[categoryIndex]} ${Math.floor(index / 4) % 2 === 0 ? "주력" : "대체"}`,
    category: productCategories[categoryIndex],
    ingredients: ["판테놀", "세라마이드"],
    keyIngredients: ["판테놀"],
    fullIngredients: "판테놀, 세라마이드",
    suitableBaumannTypes: ["PW", "PT", "NW", "NT"].map((suffix) => profile + suffix),
    isPrimary: Math.floor(index / 4) % 2 === 0,
    affiliateBaseUrl: `https://example.invalid/development-only/${index}`,
    isActive: false,
  };
});
