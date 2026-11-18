import { z } from "zod";
import type { ProcedureView } from "./procedures";

const platformHosts = {
  GANGNAMUNNI: ["gangnamunni.com", "www.gangnamunni.com", "unni.app"],
  YEOSHIN: ["yeoshin.co.kr", "www.yeoshin.co.kr"],
  BABITALK: ["babitalk.com", "www.babitalk.com"],
};
export const platformLabels = { GANGNAMUNNI: "강남언니", YEOSHIN: "여신티켓", BABITALK: "바비톡" };
const observationSchema = z
  .object({
    platform: z.enum(["GANGNAMUNNI", "YEOSHIN", "BABITALK"]),
    sourceUrl: z.url(),
    // Stable, opaque key for one provider + procedure + treatment unit, across platforms.
    sampleKey: z.string().regex(/^[a-f0-9]{64}$/),
    amountKrw: z.number().int().positive().max(100_000_000),
    vatIncluded: z.boolean(),
    observedOn: z.iso.date(),
    basis: z.string().trim().min(1).max(200),
  })
  .strict()
  .superRefine((item, ctx) => {
    const url = new URL(item.sourceUrl);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !platformHosts[item.platform].includes(url.hostname)
    )
      ctx.addIssue({ code: "custom", message: "Unexpected price source" });
  });
export type PriceObservation = z.infer<typeof observationSchema>;
type PriceResult = Pick<ProcedureView, "priceMinKrw" | "priceMaxKrw" | "priceSummary">;

/** Event-listing sample statistics, never a nationwide market estimate. No legacy zero/price fallback. */
export function summarizeProcedurePrices(
  raw: unknown,
  basis: string | null,
  today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date()),
): PriceResult {
  const observations = z.array(observationSchema).max(500).parse(raw);
  const empty: PriceResult = {
    priceMinKrw: null,
    priceMaxKrw: null,
    priceSummary: {
      status: "UNVERIFIED",
      meanKrw: null,
      sampleCount: 0,
      basis,
      observedFrom: null,
      observedThrough: null,
      platforms: [],
    },
  };
  if (!observations.length) return empty;
  if (!basis || observations.some((o) => o.basis !== basis || o.observedOn > today))
    throw new Error("Incomparable or future price observations");
  // Keep the newest observation per sampling unit; duplicate cross-platform events get one vote.
  // Same-day conflicting values require human reconciliation, rather than an arbitrary pick.
  const unique = new Map<string, PriceObservation>();
  for (const item of observations) {
    const old = unique.get(item.sampleKey);
    if (
      old?.observedOn === item.observedOn &&
      (old.amountKrw !== item.amountKrw || old.vatIncluded !== item.vatIncluded)
    )
      throw new Error("Conflicting price observations");
    if (!old || old.observedOn < item.observedOn) unique.set(item.sampleKey, item);
  }
  const samples = [...unique.values()];
  const values = samples.map((o) => (o.vatIncluded ? o.amountKrw : Math.round(o.amountKrw * 1.1)));
  const dates = samples.map((o) => o.observedOn).sort();
  return {
    priceMinKrw: Math.min(...values),
    priceMaxKrw: Math.max(...values),
    priceSummary: {
      status: "AVAILABLE",
      meanKrw: Math.round(values.reduce((sum, n) => sum + n, 0) / values.length),
      sampleCount: values.length,
      basis,
      observedFrom: dates[0],
      observedThrough: dates[dates.length - 1],
      platforms: [...new Set(observations.map((o) => platformLabels[o.platform]))].sort(),
    },
  };
}
