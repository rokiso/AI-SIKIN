import "server-only";
import type { LinkActionTaken, Product } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { getAffiliateHosts } from "@/lib/server-env";
import { invalidateProductCache } from "./curationService";
import { probeAffiliateLink, type LinkProbe } from "./linkHealthChecker";
import { matchProducts } from "./matching";
import { getIngredientRules } from "./ingredient-repository";

type Options = { dryRun?: boolean; targetProductId?: string };
type Detail = LinkProbe & {
  productId: string;
  checkedUrl: string;
  actionTaken: LinkActionTaken;
  fallbackProductId: string | null;
};

function checkedUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.origin + url.pathname : "";
  } catch {
    return "";
  }
}

export async function checkProductLinks(
  options: Options = {},
  probe: (value: string) => Promise<LinkProbe> = probeAffiliateLink,
) {
  const started = performance.now();
  const prisma = getPrisma();
  const products = await prisma.product.findMany({
    where: { isActive: true, status: { in: ["ACTIVE", "UNAVAILABLE", "OUT_OF_STOCK"] } },
    orderBy: { id: "asc" },
  });
  const work = products.filter((p) => !options.targetProductId || p.id === options.targetProductId);
  if (work.length && probe === probeAffiliateLink && !getAffiliateHosts().size)
    throw new Error("Affiliate host configuration is missing");
  const details: Detail[] = [];
  const results = new Map<string, LinkProbe>();
  const recorded = new Set<string>();
  let failedCount = 0;
  let ingredientRules: Awaited<ReturnType<typeof getIngredientRules>> | undefined;
  const getResult = async (product: Product): Promise<LinkProbe> => {
    const previous = results.get(product.id);
    if (previous) return previous;
    const result: LinkProbe =
      product.status === "OUT_OF_STOCK"
        ? {
            status: "UNHEALTHY",
            errorMessage: "OUT_OF_STOCK",
            httpStatusCode: null,
            responseTimeMs: 0,
          }
        : await probe(product.affiliateBaseUrl);
    results.set(product.id, result);
    return result;
  };
  try {
    for (let offset = 0; offset < work.length; offset += 5) {
      const group = work.slice(offset, offset + 5);
      const probed = await Promise.allSettled(group.map(getResult));
      for (const [index, selected] of probed.entries()) {
        const product = group[index];
        if (recorded.has(product.id)) continue;
        try {
          if (selected.status === "rejected") throw selected.reason;
          const result = selected.value;
          const ambiguous = result.errorMessage === "ACCESS_DENIED";
          // Imported and manually disabled rows never participate. Existing report
          // projection/redirect applies its own ingredient and owner checks.
          let fallback: Product | undefined;
          const rejectedAlternates: { candidate: Product; result: LinkProbe }[] = [];
          if (product.isPrimary && result.status !== "HEALTHY" && !ambiguous) {
            const pool = products.filter(
              (candidate) =>
                !candidate.isPrimary &&
                candidate.category === product.category &&
                candidate.status === "ACTIVE",
            );
            if (pool.length) ingredientRules ??= await getIngredientRules();
            for (const candidate of pool) {
              const compatible = product.suitableBaumannTypes.some((baumannType) =>
                matchProducts(
                  [candidate],
                  {
                    baumannType,
                    recommendedIngredients: product.keyIngredients,
                    cautionIngredients: [],
                  },
                  ingredientRules,
                ).some((category) => category.primary !== null),
              );
              if (!compatible) continue;
              const candidateResult = await getResult(candidate);
              if (candidateResult.status === "HEALTHY") {
                fallback = candidate;
                break;
              }
              if (!recorded.has(candidate.id) && candidateResult.errorMessage !== "ACCESS_DENIED")
                rejectedAlternates.push({ candidate, result: candidateResult });
            }
          }
          const detail: Detail = {
            ...result,
            productId: product.id,
            checkedUrl: checkedUrl(product.affiliateBaseUrl),
            actionTaken: ambiguous ? "MANUAL_ATTENTION_REQUIRED" : "NONE",
            fallbackProductId: null,
          };
          if (!options.dryRun) {
            const alternateDetails = await prisma.$transaction(async (tx) => {
              const observations: Detail[] = [];
              const updated = await tx.product.updateMany({
                where: { id: product.id, isActive: true, updatedAt: product.updatedAt },
                data: {
                  lastCheckedAt: new Date(),
                  healthCheckFailCount: result.status === "HEALTHY" ? 0 : { increment: 1 },
                  status:
                    product.status === "OUT_OF_STOCK" || ambiguous
                      ? product.status
                      : result.status === "HEALTHY"
                        ? "ACTIVE"
                        : "UNAVAILABLE",
                },
              });
              if (!updated.count) detail.actionTaken = "MANUAL_ATTENTION_REQUIRED";
              else if (product.isPrimary && result.status !== "HEALTHY" && !ambiguous) {
                for (const { candidate, result } of rejectedAlternates) {
                  const rejected = await tx.product.updateMany({
                    where: { id: candidate.id, isActive: true, updatedAt: candidate.updatedAt },
                    data: {
                      status: "UNAVAILABLE",
                      lastCheckedAt: new Date(),
                      healthCheckFailCount: { increment: 1 },
                    },
                  });
                  const observation: Detail = {
                    ...result,
                    productId: candidate.id,
                    checkedUrl: checkedUrl(candidate.affiliateBaseUrl),
                    actionTaken: rejected.count ? "NONE" : "MANUAL_ATTENTION_REQUIRED",
                    fallbackProductId: null,
                  };
                  await tx.affiliateLinkHealthLog.create({ data: observation });
                  observations.push(observation);
                }
                const [current] = fallback
                  ? await tx.$queryRaw<{ id: string }[]>`
                      SELECT id FROM products
                      WHERE id = ${fallback.id}
                        AND is_active = true AND is_primary = false AND status = 'ACTIVE'
                        AND affiliate_url = ${fallback.affiliateBaseUrl}
                        AND target_types = ${fallback.suitableBaumannTypes}::text[]
                        AND key_ingredients = ${fallback.keyIngredients}::text[]
                        AND ingredients = ${fallback.ingredients}::text[]
                        AND full_ingredients = ${fallback.fullIngredients}
                        AND category::text = ${fallback.category}
                      FOR SHARE`
                  : [];
                detail.actionTaken = current ? "SWITCHED_TO_FALLBACK" : "FALLBACK_FAILED";
                detail.fallbackProductId = current?.id ?? null;
              }
              await tx.affiliateLinkHealthLog.create({ data: detail });
              return observations;
            });
            for (const alternate of alternateDetails) {
              recorded.add(alternate.productId);
              details.push(alternate);
            }
            recorded.add(product.id);
          }
          details.push(detail);
        } catch {
          failedCount++;
          console.error("[affiliate-health] Product check could not be recorded", product.id);
        }
      }
    }
  } finally {
    if (!options.dryRun) invalidateProductCache();
  }
  const healthyCount = details.filter((detail) => detail.status === "HEALTHY").length;
  return {
    checkedCount: details.length,
    healthyCount,
    unhealthyCount: details.length - healthyCount,
    switchedCount: details.filter((detail) => detail.actionTaken === "SWITCHED_TO_FALLBACK").length,
    failedCount,
    executionTimeMs: Math.round(performance.now() - started),
    details,
  };
}
