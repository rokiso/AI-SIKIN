import { describe, expect, it } from "vitest";
import { baumannQuestions } from "@/lib/diagnostic/baumannData";
import { scoreBaumannAnswers, surveySubmissionSchema } from "@/lib/diagnostic/baumannScoring";
function answers(choices: number[]) {
  return baumannQuestions.map((q, i) => ({
    questionId: q.id,
    selectedChoice: choices[Math.floor(i / 3)],
  }));
}
describe("short skin questionnaire scoring", () => {
  it("maps all 16 axis combinations deterministically without depending on answer order", () => {
    const types = new Set<string>();
    for (let mask = 0; mask < 16; mask++) {
      const high = [0, 1, 2, 3].map((bit) => Boolean(mask & (1 << bit)));
      const result = scoreBaumannAnswers(answers(high.map((value) => (value ? 4 : 1))).reverse());
      expect(Object.values(result.axisScores)).toEqual(high.map((value) => (value ? 100 : 0)));
      expect(result.preliminaryType).toBe(
        `${high[0] ? "O" : "D"}${high[1] ? "S" : "R"}${high[2] ? "P" : "N"}${high[3] ? "W" : "T"}`,
      );
      types.add(result.preliminaryType);
    }
    expect(types.size).toBe(16);
  });
  it("normalizes intermediate answers and rejects duplicates, omissions, ownership injection and invalid choices", () => {
    expect(scoreBaumannAnswers(answers([2, 3, 2, 3])).axisScores).toEqual({
      oiliness: 33,
      sensitivity: 67,
      pigmentation: 33,
      elasticity: 67,
    });
    const valid = answers([1, 1, 1, 1]);
    for (const invalid of [
      valid.slice(1),
      [...valid.slice(1), valid[1]],
      valid.map((a) => ({ ...a, selectedChoice: 5 })),
      valid.map((a) => ({ ...a, selectedChoice: 1.5 })),
    ])
      expect(surveySubmissionSchema.safeParse({ answers: invalid }).success).toBe(false);
    expect(surveySubmissionSchema.safeParse({ answers: valid, userId: "victim" }).success).toBe(
      false,
    );
  });
});
