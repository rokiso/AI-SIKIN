import { z } from "zod";
import { procedureViewSchema } from "./procedures";
export const procedureSafetyRoutes = [
  { code: "P-PICO", slug: "pico-toning", category: "LASER" },
  { code: "P-FRACTIONAL", slug: "fractional-laser", category: "LASER" },
  { code: "P-LDM", slug: "ldm-ultrasound", category: "ULTRASOUND" },
  { code: "P-AQUAPEEL", slug: "aquapeel", category: "EXFOLIATION" },
  { code: "P-HIFU", slug: "hifu-lifting", category: "ULTRASOUND" },
  { code: "P-RF", slug: "rf-tightening", category: "RADIOFREQUENCY" },
  { code: "P-PN", slug: "pn-skinbooster", category: "INJECTABLE" },
  { code: "P-HA", slug: "ha-skinbooster", category: "INJECTABLE" },
  { code: "P-PEEL", slug: "peeling", category: "EXFOLIATION" },
  { code: "P-PDL", slug: "vascular-laser", category: "LASER" },
] as const;
export const safetyQuestionSchema = z
  .object({
    id: z.string().min(1).max(40),
    category: z.string().min(1).max(80),
    question: z.string().min(1).max(1000),
    reason: z.string().min(1).max(500),
  })
  .strict();
export const safetyContentSchema = z.object({
  commonSideEffects: z.array(z.string().min(1).max(1000)).max(20),
  rareRisks: z.array(z.string().min(1).max(1000)).max(20),
  contraindications: z.array(z.string().min(1).max(1000)).max(20),
  postCareInstructions: z.array(z.string().min(1).max(1000)).max(20),
  defenseQuestions: z.array(safetyQuestionSchema).max(3),
  disclaimerText: z.string().min(1).max(2000),
});
export type ProcedureSafetyContent = z.infer<typeof safetyContentSchema>;
export const safetyResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    slug: z.string(),
    procedureName: z.string(),
    category: z.string(),
    concernLabelKo: z.string(),
    scientificPrinciple: z.string(),
    recommendedInterval: z.string(),
    recoveryPeriod: z.string(),
    readiness: z.enum(["READY", "PREPARING"]),
    marketPriceBand: z.object({
      minPrice: z.number().int().positive().nullable(),
      maxPrice: z.number().int().positive().nullable(),
      currency: z.literal("KRW"),
      unit: z.string().nullable(),
    }),
    priceSummary: procedureViewSchema.shape.priceSummary,
    safetyInfo: safetyContentSchema.omit({ defenseQuestions: true, disclaimerText: true }),
    defenseQuestions: z.array(safetyQuestionSchema).max(3),
    disclaimerText: z.string(),
  }),
});
export type ProcedureSafetyView = z.infer<typeof safetyResponseSchema>["data"];
export const safetyFailureMessage =
  "시술 정보를 불러올 수 없습니다. 일시적인 오류이거나 존재하지 않는 시술 항목입니다.";
export function formatDefenseQuestions(
  name: string,
  questions: z.infer<typeof safetyQuestionSchema>[],
) {
  const checked = z.array(safetyQuestionSchema).length(3).parse(questions);
  return `[피부과 상담 과잉 진료 방어 질문지 - ${name}]\n${checked.map((q, i) => `${i + 1}. ${q.question}`).join("\n")}\n* 본 질문지는 객관적 정보 확인을 위한 가이드입니다.`;
}
