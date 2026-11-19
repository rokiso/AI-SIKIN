import "server-only";
import { getPrisma } from "@/lib/prisma";
import { getProcedureCatalogSource } from "@/lib/server-env";
import { getProcedures } from "./procedureService";
import { procedureSafetySeeds, safetyDisclaimer } from "@/prisma/seeds/procedure-safety";
import {
  procedureSafetyRoutes,
  safetyContentSchema,
  safetyResponseSchema,
  type ProcedureSafetyView,
} from "./procedure-safety-types";
export async function getProcedureSafetyGuide(slug: string): Promise<ProcedureSafetyView | null> {
  const route = procedureSafetyRoutes.find((r) => r.slug === slug);
  if (!route) return null;
  const procedure = (await getProcedures()).procedures.find((p) => p.code === route.code);
  if (!procedure) return null;
  // Reuse the cached price/principle catalog, but read the current safety record.
  // Bind both slug and parent ID so a mismatched admin row cannot mix procedures.
  const raw =
    getProcedureCatalogSource() === "published"
      ? procedureSafetySeeds.find((g) => g.slug === slug)
      : await getPrisma().procedureSafetyGuide.findFirst({
          where: { slug, procedureId: procedure.id },
        });
  const guide = raw
    ? safetyContentSchema.parse(raw)
    : {
        commonSideEffects: [],
        rareRisks: [],
        contraindications: [],
        postCareInstructions: [],
        defenseQuestions: [],
        disclaimerText: safetyDisclaimer,
      };
  const readiness =
    guide.commonSideEffects.length &&
    guide.rareRisks.length &&
    guide.contraindications.length &&
    guide.postCareInstructions.length &&
    guide.defenseQuestions.length === 3
      ? "READY"
      : "PREPARING";
  const { defenseQuestions, disclaimerText, ...safetyInfo } = guide;
  return safetyResponseSchema.parse({
    success: true,
    data: {
      slug,
      procedureName: procedure.nameKo,
      category: route.category,
      concernLabelKo: procedure.concernLabelKo,
      scientificPrinciple: procedure.principleDescription,
      recommendedInterval: procedure.recommendedInterval,
      recoveryPeriod: procedure.recoveryPeriod,
      readiness,
      marketPriceBand: {
        minPrice: procedure.priceMinKrw,
        maxPrice: procedure.priceMaxKrw,
        currency: "KRW",
        unit: procedure.priceSummary.basis,
      },
      priceSummary: procedure.priceSummary,
      safetyInfo,
      defenseQuestions,
      disclaimerText,
    },
  }).data;
}
