import { z } from "zod";

export const concernSchema = z.enum([
  "ACNE_SCAR",
  "PIGMENTATION",
  "PORE_SEBUM",
  "ELASTICITY",
  "BARRIER_REDNESS",
]);
export type ProcedureConcern = z.infer<typeof concernSchema>;
export const concernLabels: Record<ProcedureConcern, string> = {
  ACNE_SCAR: "여드름·흉터",
  PIGMENTATION: "색소·잡티",
  PORE_SEBUM: "모공·피지",
  ELASTICITY: "탄력·리프팅",
  BARRIER_REDNESS: "장벽·홍조",
};
export const procedureDisclaimer =
  "본 안내는 의료 진단이나 특정 병원 유인 목적이 아닌 일반 시술 정보입니다. 시술 여부와 방법은 의료진과 상담해 주세요.";
export const procedureFailureMessage =
  "시술 가이드 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.";
export const procedureQuerySchema = z.object({ concern: concernSchema.optional() }).strict();
const priceSchema = z.object({
  status: z.enum(["AVAILABLE", "UNVERIFIED"]),
  meanKrw: z.number().int().positive().nullable(),
  sampleCount: z.number().int().nonnegative(),
  basis: z.string().nullable(),
  observedFrom: z.string().nullable(),
  observedThrough: z.string().nullable(),
  platforms: z.array(z.string()),
});
export const procedureViewSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  nameKo: z.string(),
  aliases: z.array(z.string()),
  concernType: concernSchema,
  concernLabelKo: z.string(),
  principleDescription: z.string(),
  recommendedInterval: z.string(),
  sideEffectsWarning: z.string(),
  recoveryPeriod: z.string(),
  priceMinKrw: z.number().int().positive().nullable(),
  priceMaxKrw: z.number().int().positive().nullable(),
  priceSummary: priceSchema,
  checklistQuestions: z.array(z.string().trim().min(1)).length(3),
});
export type ProcedureView = z.infer<typeof procedureViewSchema>;
export const procedureListResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({ total: z.number(), procedures: z.array(procedureViewSchema) }),
});
export const procedureDetailResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({ procedure: procedureViewSchema }),
});
const won = (amount: number) => `${new Intl.NumberFormat("ko-KR").format(amount)}원`;
export function formatProcedurePrice(
  procedure: Pick<ProcedureView, "priceMinKrw" | "priceMaxKrw" | "priceSummary">,
) {
  if (
    procedure.priceSummary.status !== "AVAILABLE" ||
    procedure.priceMinKrw === null ||
    procedure.priceMaxKrw === null
  )
    return "가격 자료 확인 중";
  if (procedure.priceMinKrw === procedure.priceMaxKrw)
    return `확인된 가격 ${won(procedure.priceMinKrw)}`;
  return `${won(procedure.priceMinKrw)} ~ ${won(procedure.priceMaxKrw)}`;
}
export function formatChecklist(questions: string[]) {
  return z.array(z.string().trim().min(1)).length(3).parse(questions).join("\n");
}
export function formatPriceMean(amount: number) {
  return won(amount);
}
