import "server-only";
import { getPrisma } from "@/lib/prisma";
import type { ProcedureConcern, ProcedureView } from "./procedures";
import { projectProcedure } from "./procedure-projection";
import { getPublishedProcedures } from "./procedure-published";
import { getProcedureCatalogSource } from "@/lib/server-env";

let cached: { rows: ProcedureView[]; expires: number } | null = null;
let loading: Promise<ProcedureView[]> | null = null;
let revision = 0;
export function invalidateProcedureCache() {
  cached = null;
  loading = null;
  revision++;
}

async function catalog(): Promise<ProcedureView[]> {
  if (getProcedureCatalogSource() === "published") return getPublishedProcedures();
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
      const result = rows.map(projectProcedure);
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
