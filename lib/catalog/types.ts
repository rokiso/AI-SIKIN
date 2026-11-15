import { z } from "zod";

export const categories = [
  { category: "TONER", dbCategory: "TONER", categoryNameKo: "토너" },
  { category: "AMPOULE", dbCategory: "SERUM", categoryNameKo: "앰플" },
  { category: "CREAM", dbCategory: "CREAM", categoryNameKo: "크림" },
  { category: "SUNSCREEN", dbCategory: "SUNCARE", categoryNameKo: "자외선 차단제" },
] as const;
export const cosmeticDisclaimer =
  "본 추천은 화장품 성분 특성에 기반하며 질병의 예방 및 치료를 위한 의학적 효능·효과를 의미하지 않습니다.";
export const reportQuerySchema = z.object({ reportId: z.uuid() }).strict();
export const redirectQuerySchema = z
  .object({
    productId: z.uuid(),
    reportId: z.uuid().optional(),
    tier: z.enum(["PRIMARY", "SECONDARY"]).default("PRIMARY"),
  })
  .strict();
const productSchema = z.object({
  id: z.uuid(),
  brandName: z.string(),
  productName: z.string(),
  thumbnailUrl: z.string().nullable(),
  keyIngredients: z.array(z.string()),
  recommendationReason: z.string(),
  status: z.enum(["ACTIVE", "OUT_OF_STOCK", "DISCONTINUED", "UNAVAILABLE"]),
  redirectPath: z.string().nullable(),
});
export const recommendationsSchema = z.object({
  reportId: z.uuid(),
  baumannType: z.string().regex(/^[OD][SR][PN][WT]$/),
  categories: z.array(
    z.object({
      category: z.enum(["TONER", "AMPOULE", "CREAM", "SUNSCREEN"]),
      categoryNameKo: z.string(),
      primaryProduct: productSchema.nullable(),
      secondaryProduct: productSchema.nullable(),
      isFallbackActive: z.boolean(),
    }),
  ),
  recommendedIngredients: z.array(z.string()),
  disclaimer: z.string(),
});
export type ProductRecommendationResponse = z.infer<typeof recommendationsSchema>;
export type ProductView = z.infer<typeof productSchema>;
