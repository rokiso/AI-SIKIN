import { describe, expect, it } from "vitest";
import { summarizeProcedurePrices, type PriceObservation } from "@/lib/catalog/procedure-pricing";
import { formatChecklist, formatProcedurePrice } from "@/lib/catalog/procedures";
import { procedureGuides } from "../../prisma/seeds/procedures";
// Synthetic arithmetic fixtures only, not collected market prices.
const sample: PriceObservation = {
  platform: "GANGNAMUNNI",
  sourceUrl: "https://www.gangnamunni.com/events/test-fixture",
  sampleKey: "a".repeat(64),
  amountKrw: 10000,
  vatIncluded: false,
  observedOn: "2026-11-17",
  basis: "테스트: 동일 부위 1회",
};
const summary = (rows: unknown) => summarizeProcedurePrices(rows, sample.basis, "2026-11-18");
describe("procedure observation statistics", () => {
  it("normalizes VAT, deduplicates a provider across platforms, and reports a sample mean", () => {
    const data = summary([
      sample,
      { ...sample, platform: "BABITALK", sourceUrl: "https://www.babitalk.com/test-fixture" },
      { ...sample, sampleKey: "b".repeat(64), amountKrw: 22000, vatIncluded: true },
    ]);
    expect(data).toMatchObject({
      priceMinKrw: 11000,
      priceMaxKrw: 22000,
      priceSummary: { meanKrw: 16500, sampleCount: 2, platforms: ["강남언니", "바비톡"] },
    });
    expect(formatProcedurePrice(data)).toBe("11,000원 ~ 22,000원");
  });
  it("uses the latest observation and never counts repeated days as extra samples", () => {
    const data = summary([sample, { ...sample, observedOn: "2026-11-18", amountKrw: 20000 }]);
    expect(data.priceSummary).toMatchObject({
      meanKrw: 22000,
      sampleCount: 1,
      observedFrom: "2026-11-18",
    });
  });
  it("does not invent zero prices when observations are absent", () => {
    const data = summary([]);
    expect(data.priceMinKrw).toBeNull();
    expect(data.priceSummary.status).toBe("UNVERIFIED");
    expect(formatProcedurePrice(data)).toBe("가격 자료 확인 중");
  });
  it.each([
    { ...sample, amountKrw: 0 },
    { ...sample, amountKrw: -1 },
    { ...sample, vatIncluded: null },
    { ...sample, basis: "다른 용량" },
    { ...sample, observedOn: "2026-11-19" },
    { ...sample, observedOn: "2026-02-30" },
    { ...sample, sourceUrl: "https://www.gangnamunni.com.attacker.invalid/event" },
    { ...sample, sourceUrl: "https://secret@www.gangnamunni.com/event" },
    { ...sample, sourceUrl: "http://www.gangnamunni.com/event" },
    { ...sample, platform: "YEOSHIN" },
  ])("rejects missing evidence and incomparable observations: %j", (row) => {
    expect(() => summary([row])).toThrow();
  });
  it("rejects conflicting same-day duplicate prices", () => {
    expect(() => summary([sample, { ...sample, amountKrw: 20000 }])).toThrow();
  });
});
describe("procedure guide content", () => {
  it("has ten distinct guides and three nonempty consultation questions each", () => {
    expect(procedureGuides).toHaveLength(10);
    expect(new Set(procedureGuides.map((p) => p.code)).size).toBe(10);
    for (const guide of procedureGuides) {
      expect(guide.principleText.length).toBeGreaterThan(30);
      expect(guide.sideEffects.length).toBeGreaterThan(0);
      expect(guide.recoveryPeriod.length).toBeGreaterThan(10);
      expect(formatChecklist(guide.checklistQuestions).split("\n")).toHaveLength(3);
    }
  });
  it("formats exactly three questions and rejects incomplete checklists", () => {
    expect(formatChecklist([" 질문1 ", "질문2", "질문3"])).toBe("질문1\n질문2\n질문3");
    expect(() => formatChecklist(["질문1", "질문2"])).toThrow();
    expect(() => formatChecklist(["질문1", "", "질문3"])).toThrow();
  });
});
