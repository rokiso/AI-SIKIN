import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { z } from "zod";
import { summarizeProcedurePriceOptions } from "@/lib/catalog/procedure-pricing";
const directory = join(process.cwd(), "data/procedure-prices/2026-11-24");
const audit = z
  .object({
    acceptedObservations: z.number().int(),
    priceConditions: z.number().int(),
    observations: z.array(
      z.object({
        code: z.string(),
        sourceUrl: z.url(),
        sampleKey: z.string().regex(/^[a-f0-9]{64}$/),
        optionId: z.union([z.number().int().positive(), z.uuid()]).nullable(),
        sourceHtmlSha256: z.string().regex(/^[a-f0-9]{64}$/),
        sourceOptionLabelSha256: z.string().regex(/^[a-f0-9]{64}$/),
        priceKrw: z.number().int().positive(),
        priceSelection: z.literal("PUBLIC_BEFORE_COUPON_POINTS"),
        publiclyDisplayedOption: z.literal(true),
        currency: z.literal("KRW"),
        treatmentCount: z.literal(1).nullable(),
        limitations: z.string().optional(),
        retrievedAt: z.iso.datetime({ offset: true }),
        basis: z.string(),
      }),
    ),
  })
  .parse(JSON.parse(readFileSync(join(directory, "evidence.json"), "utf8")));
const dataset = z.object({
  code: z.string(),
  basis: z.string(),
  observations: z.array(
    z
      .object({
        platform: z.string(),
        sourceUrl: z.url(),
        sampleKey: z.string(),
        amountKrw: z.number(),
        basis: z.string(),
      })
      .passthrough(),
  ),
});
it("backs expanded prices with opened detailed options and keeps all 102 conditions separate", () => {
  const names = readdirSync(directory).filter((name) => /^P-.*\.json$/.test(name));
  expect(names).toHaveLength(10);
  let samples = 0,
    conditions = 0;
  const platforms = new Set<string>();
  for (const name of names) {
    const data = dataset.parse(JSON.parse(readFileSync(join(directory, name), "utf8")));
    const result = summarizeProcedurePriceOptions(data.observations, data.basis, "2026-11-24");
    expect(result.priceSummary.sampleCount).toBeGreaterThan(1);
    expect(result.priceOptions.length).toBeGreaterThan(1);
    expect(
      result.priceOptions.every(
        (option) =>
          option.priceMinKrw !== null &&
          option.priceMaxKrw !== null &&
          option.priceMinKrw <= option.priceMaxKrw,
      ),
    ).toBe(true);
    for (const row of data.observations) {
      const evidence = audit.observations.find(
        (item) =>
          item.code === data.code &&
          item.sampleKey === row.sampleKey &&
          item.sourceUrl === row.sourceUrl,
      );
      expect(evidence?.priceKrw).toBe(row.amountKrw);
      expect(evidence?.basis).toBe(row.basis);
      if (evidence?.treatmentCount === null) {
        expect(evidence.limitations).toBeTruthy();
        expect(row.basis).toContain("횟수 미기재");
        expect(row.basis).not.toContain("1회");
      }
      platforms.add(row.platform);
    }
    expect(new Set(data.observations.map((row) => row.sampleKey)).size).toBe(
      data.observations.length,
    );
    samples += result.priceOptions.reduce(
      (sum, option) => sum + option.priceSummary.sampleCount,
      0,
    );
    conditions += result.priceOptions.length;
  }
  expect(samples).toBe(audit.acceptedObservations);
  expect(samples).toBe(260);
  expect(conditions).toBe(audit.priceConditions);
  expect(conditions).toBe(102);
  expect([...platforms].sort()).toEqual(["BABITALK", "GANGNAMUNNI", "YEOSHIN"]);
});
