import "server-only";
import type { MedicalProcedure } from "@/generated/prisma/client";
import { concernLabels, procedureViewSchema, type ProcedureView } from "./procedures";
import { summarizeProcedurePrices } from "./procedure-pricing";
export type ProcedureRecord = Pick<
  MedicalProcedure,
  | "id"
  | "code"
  | "nameKo"
  | "aliases"
  | "concernType"
  | "principleText"
  | "recommendedInterval"
  | "sideEffects"
  | "recoveryPeriod"
  | "checklistQuestions"
  | "priceObservations"
  | "priceBasis"
>;
export function projectProcedure(row: ProcedureRecord): ProcedureView {
  return procedureViewSchema.parse({
    id: row.id,
    code: row.code,
    nameKo: row.nameKo,
    aliases: row.aliases,
    concernType: row.concernType,
    concernLabelKo: row.concernType ? concernLabels[row.concernType] : "",
    principleDescription: row.principleText,
    recommendedInterval: row.recommendedInterval,
    sideEffectsWarning: row.sideEffects.join(" "),
    recoveryPeriod: row.recoveryPeriod,
    checklistQuestions: row.checklistQuestions,
    ...summarizeProcedurePrices(row.priceObservations, row.priceBasis),
  });
}
