import "server-only";
import type { z } from "zod";
import type { VerifiedIdentity } from "@/lib/session/identity-types";
import { AuthError } from "@/lib/auth/response";
import { getPrisma } from "@/lib/prisma";
import { isCatalogPreviewOnly } from "@/lib/server-env";
import { sampleCatalogProducts } from "./sample-data";
import { authorizedReport, getLatestCatalogReportId } from "./curationService";
import { getIngredientRules } from "./ingredient-repository";
import {
  analyzeIngredients,
  assertIngredientCopy,
  defaultIngredientRules,
  ingredientCoverageNotice,
  ingredientRegulatoryNotice,
  parseFullIngredients,
} from "./ingredient-rules";
import type { IngredientProjection, ingredientQuerySchema } from "./ingredient-types";

export async function getProductIngredients(
  productId: string,
  query: z.infer<typeof ingredientQuerySchema>,
  identity: VerifiedIdentity,
): Promise<IngredientProjection> {
  const demo = isCatalogPreviewOnly();
  const product = demo
    ? sampleCatalogProducts.find((p) => p.id === productId)
    : await getPrisma().product.findFirst({ where: { id: productId, isActive: true } });
  if (!product) throw new AuthError(404, "PRODUCT_NOT_FOUND", "해당 제품을 찾을 수 없습니다.");
  let report: null | Awaited<ReturnType<typeof authorizedReport>> = null;
  if (query.reportId) report = await authorizedReport(query.reportId, identity);
  else if (!demo && !query.baumannType && identity.kind !== "anonymous") {
    const latest = await getLatestCatalogReportId(identity);
    if (latest) report = await authorizedReport(latest, identity);
  }
  const targetBaumannType = query.baumannType ?? report?.baumannType ?? null;
  const typeSource = query.baumannType ? "SELECTED" : report ? "REPORT" : "GENERAL";
  const fullIngredients = parseFullIngredients(product.fullIngredients);
  if (fullIngredients.length > 1000 || product.fullIngredients.length > 64000)
    throw new Error("Ingredient list too large");
  for (const label of [product.brandName, product.productName, ...fullIngredients])
    assertIngredientCopy(label);
  const rules = demo ? defaultIngredientRules : await getIngredientRules();
  const analysis = analyzeIngredients(
    fullIngredients,
    targetBaumannType,
    rules,
    report?.baumannType === targetBaumannType ? report.recommendedIngredients : [],
  );
  return {
    productId,
    brandName: product.brandName,
    productName: product.productName,
    targetBaumannType,
    typeSource,
    isDemo: demo,
    ingredientsSummary: {
      totalCount: fullIngredients.length,
      beneficialCount: analysis.beneficialIngredients.length,
      cautionCount: analysis.cautionIngredients.length,
    },
    ...analysis,
    fullIngredients,
    regulatoryNotice: ingredientRegulatoryNotice,
    coverageNotice: ingredientCoverageNotice,
  };
}
