import { z } from "zod";
import { baumannTypeSchema } from "./ingredient-rules";
export const ingredientQuerySchema = z
  .object({ baumannType: baumannTypeSchema.optional(), reportId: z.uuid().optional() })
  .strict();
export const ingredientResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    productId: z.uuid(),
    brandName: z.string(),
    productName: z.string(),
    targetBaumannType: baumannTypeSchema.nullable(),
    typeSource: z.enum(["SELECTED", "REPORT", "GENERAL"]),
    isDemo: z.boolean(),
    ingredientsSummary: z.object({
      totalCount: z.number().int().nonnegative(),
      beneficialCount: z.number().int().nonnegative(),
      cautionCount: z.number().int().nonnegative(),
    }),
    beneficialIngredients: z.array(
      z.object({ nameKo: z.string(), functionSummary: z.string(), isTargetMatched: z.boolean() }),
    ),
    cautionIngredients: z.array(
      z.object({
        nameKo: z.string(),
        level: z.enum(["INFO", "CAUTION", "WARNING"]),
        matchedAxis: z.string(),
        badgeText: z.string(),
        reasonKo: z.string(),
      }),
    ),
    fullIngredients: z.array(z.string()),
    regulatoryNotice: z.string(),
    coverageNotice: z.string(),
  }),
});
export type IngredientProjection = z.infer<typeof ingredientResponseSchema>["data"];
