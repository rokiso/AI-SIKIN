import "server-only";
import { getPrisma } from "@/lib/prisma";
import { ingredientRuleSchema, validateIngredientDefinitions } from "./ingredient-rules";
export async function getIngredientRules() {
  const rows = await getPrisma().ingredientCautionRule.findMany({
    orderBy: { standardName: "asc" },
    take: 501,
  });
  if (!rows.length || rows.length > 500) throw new Error("Ingredient rules unavailable");
  const rules = rows.map((row) => ingredientRuleSchema.parse(row));
  validateIngredientDefinitions(rules);
  return rules;
}
