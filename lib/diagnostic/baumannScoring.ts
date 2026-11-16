import { z } from "zod";
import { baumannQuestions, type BaumannAxis } from "./baumannData";
export const surveyAnswersSchema = z
  .array(
    z
      .object({
        questionId: z.string().regex(/^Q(?:0[1-9]|1[0-2])$/),
        selectedChoice: z.number().int().min(1).max(4),
      })
      .strict(),
  )
  .length(12)
  .refine((answers) => new Set(answers.map((a) => a.questionId)).size === 12);
export const surveySubmissionSchema = z
  .object({
    answers: surveyAnswersSchema,
    uploadSessionId: z.uuid().nullable().optional(),
    requestId: z.uuid().optional(),
  })
  .strict();
export type SurveySubmission = z.infer<typeof surveySubmissionSchema>;
export type BaumannAxisScores = Record<BaumannAxis, number>;
export function scoreBaumannAnswers(input: unknown) {
  const answers = surveyAnswersSchema.parse(input);
  const totals: BaumannAxisScores = { oiliness: 0, sensitivity: 0, pigmentation: 0, elasticity: 0 };
  for (const question of baumannQuestions) {
    const answer = answers.find((item) => item.questionId === question.id);
    if (!answer) throw new Error("Missing survey answer");
    totals[question.axis] += answer.selectedChoice - 1;
  }
  const axisScores: BaumannAxisScores = {
    oiliness: Math.round((totals.oiliness / 9) * 100),
    sensitivity: Math.round((totals.sensitivity / 9) * 100),
    pigmentation: Math.round((totals.pigmentation / 9) * 100),
    elasticity: Math.round((totals.elasticity / 9) * 100),
  };
  const preliminaryType = `${axisScores.oiliness >= 50 ? "O" : "D"}${axisScores.sensitivity >= 50 ? "S" : "R"}${axisScores.pigmentation >= 50 ? "P" : "N"}${axisScores.elasticity >= 50 ? "W" : "T"}`;
  return { axisScores, preliminaryType };
}
