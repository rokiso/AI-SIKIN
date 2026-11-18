import { describe, expect, it } from "vitest";
import { combineVisionScores, ruleBasedEvaluator } from "@/lib/diagnostic/ruleBasedEvaluator";
import { baumannTypeSchema } from "@/lib/dashboard/types";

describe("diagnostic rules and survey weighting", () => {
  it("maps all sixteen codes at the 49/50 boundaries", () => {
    const codes = new Set<string>();
    for (const oiliness of [49, 50])
      for (const sensitivity of [49, 50])
        for (const pigmentation of [49, 50])
          for (const elasticity of [49, 50]) {
            const scores = { oiliness, sensitivity, pigmentation, elasticity };
            const result = ruleBasedEvaluator(scores);
            const expected = `${oiliness === 50 ? "O" : "D"}${sensitivity === 50 ? "S" : "R"}${pigmentation === 50 ? "P" : "N"}${elasticity === 50 ? "W" : "T"}`;
            expect(result.baumannType).toBe(expected);
            expect(result.axisScores).toEqual(scores);
            expect(result.recommendedIngredients.length).toBeGreaterThan(0);
            expect(result.baumannNameKo).toContain("피부");
            codes.add(result.baumannType);
          }
    expect([...codes].sort()).toEqual([...baumannTypeSchema.options].sort());
  });
  it("keeps at least sixty percent of survey values on each axis", () => {
    const survey = { oiliness: 100, sensitivity: 0, pigmentation: 100, elasticity: 0 };
    const features = {
      visualOilinessHint: "DRY" as const,
      visualErythemaScore: 100,
      visualPigmentScore: 0,
      visualPoreWrinkleScore: 100,
      confidenceScore: 1,
    };
    expect(combineVisionScores(survey, features)).toEqual({
      oiliness: 60,
      sensitivity: 40,
      pigmentation: 60,
      elasticity: 40,
    });
    expect(combineVisionScores(survey, { ...features, confidenceScore: 0.5 })).toEqual({
      oiliness: 80,
      sensitivity: 20,
      pigmentation: 80,
      elasticity: 20,
    });
    expect(combineVisionScores(survey, { ...features, confidenceScore: 0 })).toEqual(survey);
    expect(() => ruleBasedEvaluator({ ...survey, oiliness: 101 })).toThrow();
  });
});
