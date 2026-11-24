import { afterEach, describe, expect, it, vi } from "vitest";
import { getProcedureCatalogSource } from "@/lib/server-env";
import { getPrisma } from "@/lib/prisma";
import {
  getProcedures,
  getProcedure,
  invalidateProcedureCache,
} from "@/lib/catalog/procedureService";
import { GET as list } from "../../app/api/v1/catalog/procedures/route";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  invalidateProcedureCache();
});
describe("published public procedure catalog", () => {
  it("serves ten reviewed guides and three-platform prices on Vercel without a database query", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("PROCEDURE_CATALOG_SOURCE", "");
    const query = vi.spyOn(getPrisma().medicalProcedure, "findMany");
    const all = await getProcedures();
    expect(all.total).toBe(10);
    const pn = all.procedures.find((p) => p.code === "P-PN");
    expect(pn?.priceSummary).toMatchObject({
      meanKrw: 201850,
      sampleCount: 8,
      platforms: ["여신티켓"],
    });
    expect(pn?.priceOptions?.length).toBeGreaterThan(5);
    expect(
      [
        ...new Set(
          all.procedures.flatMap(
            (p) => p.priceOptions?.flatMap((o) => o.priceSummary.platforms) ?? [],
          ),
        ),
      ].sort(),
    ).toEqual(["강남언니", "바비톡", "여신티켓"]);
    expect((await getProcedures("PIGMENTATION")).total).toBe(1);
    expect(await getProcedure(all.procedures[0].id)).toEqual(all.procedures[0]);
    expect(await getProcedure("00000000-0000-4000-8000-999999999999")).toBeNull();
    expect(query).not.toHaveBeenCalled();
    expect(JSON.stringify(all)).not.toMatch(/sourceUrl|sampleKey|hospital/);
    const response = await list(new Request("http://localhost/api/v1/catalog/procedures"));
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Procedure-Catalog-Source")).toBe("published");
  });
  it("honors an explicit database choice and rejects invalid configuration", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("PROCEDURE_CATALOG_SOURCE", "database");
    expect(getProcedureCatalogSource()).toBe("database");
    vi.stubEnv("PROCEDURE_CATALOG_SOURCE", "typo");
    expect(() => getProcedureCatalogSource()).toThrow();
  });
});
