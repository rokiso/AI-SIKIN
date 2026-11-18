import "server-only";
import type { MedicalProcedure } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import {
  concernLabels,
  procedureViewSchema,
  type ProcedureConcern,
  type ProcedureView,
} from "./procedures";
import { summarizeProcedurePrices } from "./procedure-pricing";

let cached: { rows: ProcedureView[]; expires: number } | null = null;
let loading: Promise<ProcedureView[]> | null = null;
let revision = 0;
export function invalidateProcedureCache() {
  cached = null;
  loading = null;
  revision++;
}
function project(row: MedicalProcedure): ProcedureView {
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
async function catalog(): Promise<ProcedureView[]> {
  if (cached && cached.expires > Date.now()) return cached.rows;
  if (loading) return loading;
  const started = revision;
  const pending = getPrisma()
    .medicalProcedure.findMany({
      where: { isActive: true, code: { not: null }, concernType: { not: null } },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      take: 256,
    })
    .then((rows) => {
      const result = rows.map(project);
      if (revision === started) cached = { rows: result, expires: Date.now() + 30_000 };
      return result;
    });
  loading = pending;
  try {
    return await pending;
  } finally {
    if (loading === pending) loading = null;
  }
}
export async function getProcedures(concern?: ProcedureConcern) {
  const all = await catalog();
  const procedures = concern ? all.filter((row) => row.concernType === concern) : all;
  return { total: procedures.length, procedures };
}
export async function getProcedure(id: string) {
  return (await catalog()).find((row) => row.id === id) ?? null;
}
