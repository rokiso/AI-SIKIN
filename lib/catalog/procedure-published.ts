import "server-only";
import { procedureGuides, procedureIntervalNote } from "@/prisma/seeds/procedures";
import pico from "@/data/procedure-prices/2026-11-24/P-PICO.json";
import fractional from "@/data/procedure-prices/2026-11-24/P-FRACTIONAL.json";
import ldm from "@/data/procedure-prices/2026-11-24/P-LDM.json";
import aqua from "@/data/procedure-prices/2026-11-24/P-AQUAPEEL.json";
import hifu from "@/data/procedure-prices/2026-11-24/P-HIFU.json";
import rf from "@/data/procedure-prices/2026-11-24/P-RF.json";
import pn from "@/data/procedure-prices/2026-11-24/P-PN.json";
import ha from "@/data/procedure-prices/2026-11-24/P-HA.json";
import peel from "@/data/procedure-prices/2026-11-24/P-PEEL.json";
import pdl from "@/data/procedure-prices/2026-11-24/P-PDL.json";
import type { ProcedureView } from "./procedures";
import { projectProcedure } from "./procedure-projection";

const prices = new Map(
  [pico, fractional, ldm, aqua, hifu, rf, pn, ha, peel, pdl].map((data) => [data.code, data]),
);
let published: ProcedureView[] | null = null;

/** Versioned, read-only public catalog. This path never queries or changes a database. */
export function getPublishedProcedures(): ProcedureView[] {
  if (published) return published;
  published = procedureGuides.map((guide, index) => {
    const price = prices.get(guide.code);
    if (!price) throw new Error("Published procedure price data missing");
    return projectProcedure({
      ...guide,
      id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      recommendedInterval: procedureIntervalNote,
      priceBasis: price.basis,
      priceObservations: price.observations,
    });
  });
  return published;
}
