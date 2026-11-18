import { axisScoresSchema, baumannTypeSchema, type AxisScores } from "@/lib/dashboard/types";
import { describeBaumannType, ingredientsForType } from "./baumannMapping";
import type { VisionFeatures } from "@/lib/ai/schema";

export function ruleBasedEvaluator(input: AxisScores) {
  const scores = axisScoresSchema.parse(input);
  const baumannType = baumannTypeSchema.parse(
    `${scores.oiliness >= 50 ? "O" : "D"}${scores.sensitivity >= 50 ? "S" : "R"}${scores.pigmentation >= 50 ? "P" : "N"}${scores.elasticity >= 50 ? "W" : "T"}`,
  );
  return {
    baumannType,
    baumannNameKo: describeBaumannType(baumannType),
    axisScores: scores,
    summary:
      "최근 한 달의 자가문진 응답을 정리한 스킨케어 참고 정보입니다. 피부 상태는 환경에 따라 달라질 수 있으니 보습과 자외선 차단을 기본으로, 새 제품은 좁은 부위에서 먼저 확인해 주세요.",
    ...ingredientsForType(baumannType),
  };
}

export function combineVisionScores(
  survey: AxisScores,
  features: VisionFeatures["extractedFeatures"],
) {
  // At most 40% visual influence. Low confidence moves the result toward the survey.
  const weight = 0.4 * features.confidenceScore;
  const visual = {
    oiliness: { DRY: 0, NORMAL: 50, OILY: 100 }[features.visualOilinessHint],
    sensitivity: features.visualErythemaScore,
    pigmentation: features.visualPigmentScore,
    elasticity: features.visualPoreWrinkleScore,
  };
  return axisScoresSchema.parse(
    Object.fromEntries(
      Object.entries(survey).map(([key, value]) => [
        key,
        Math.round(value * (1 - weight) + visual[key as keyof AxisScores] * weight),
      ]),
    ),
  );
}
