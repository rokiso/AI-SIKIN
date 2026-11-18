import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { summarizeProcedurePrices } from "@/lib/catalog/procedure-pricing";

const directory = join(process.cwd(), "data/procedure-prices/2026-11-18");
const evidence = z
  .object({
    observations: z.array(
      z.object({
        code: z.string(),
        sourceUrl: z.url(),
        optionId: z.union([z.number().int().positive(), z.uuid()]).nullable(),
        optionLabel: z.string().min(1),
        priceKrw: z.number().int().positive(),
        priceSelection: z.literal("PUBLIC_BEFORE_COUPON_POINTS"),
        currency: z.literal("KRW"),
        treatmentCount: z.literal(1).nullable(),
        limitations: z.string().min(1).optional(),
        listedIncludedFees: z.string().regex(/VAT/),
        sourceHtmlSha256: z.string().regex(/^[a-f0-9]{64}$/),
        retrievedAt: z.iso.datetime({ offset: true }),
      }),
    ),
  })
  .parse(JSON.parse(readFileSync(join(directory, "evidence.json"), "utf8")));
const datasetSchema = z.object({
  code: z.string(),
  basis: z.string().min(1),
  observations: z
    .array(
      z
        .object({
          sourceUrl: z.url(),
          amountKrw: z.number().int().positive(),
          platform: z.enum(["YEOSHIN", "GANGNAMUNNI", "BABITALK"]),
        })
        .passthrough(),
    )
    .min(1),
});

describe("collected procedure price provenance", () => {
  it("keeps ten datasets attributable to all three platforms without inventing session counts", () => {
    const files = readdirSync(directory).filter((name) => /^P-.*\.json$/.test(name));
    expect(files).toHaveLength(10);
    let totalSources = 0,
      totalSamples = 0;
    const platforms = new Set<string>();
    for (const name of files) {
      const data = datasetSchema.parse(JSON.parse(readFileSync(join(directory, name), "utf8")));
      const summary = summarizeProcedurePrices(data.observations, data.basis, "2026-11-18");
      expect(summary.priceSummary.status).toBe("AVAILABLE");
      for (const observation of data.observations) {
        platforms.add(observation.platform);
        const source = evidence.observations.find(
          (item) => item.code === data.code && item.sourceUrl === observation.sourceUrl,
        );
        expect(source?.priceKrw).toBe(observation.amountKrw);
        if (source?.treatmentCount === null) {
          expect(source.limitations).toBeTruthy();
          expect(data.basis).not.toContain("1회");
          expect(data.basis).toContain("횟수");
        }
      }
      totalSources += data.observations.length;
      totalSamples += summary.priceSummary.sampleCount;
    }
    expect(totalSources).toBe(evidence.observations.length);
    expect(totalSamples).toBeLessThan(totalSources);
    expect([...platforms].sort()).toEqual(["BABITALK", "GANGNAMUNNI", "YEOSHIN"]);
  });
});
