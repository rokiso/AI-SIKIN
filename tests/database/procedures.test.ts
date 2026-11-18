import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { getPrisma } from "@/lib/prisma";
import { assertLocalDevelopmentDatabase } from "@/lib/database-development";
import { getDatabaseUrl } from "@/lib/server-env";
import { seedProcedureGuides, procedureGuides } from "../../prisma/seeds/procedures";
import {
  getProcedure,
  getProcedures,
  invalidateProcedureCache,
} from "@/lib/catalog/procedureService";
import { GET as list } from "../../app/api/v1/catalog/procedures/route";
import { GET as detail } from "../../app/api/v1/catalog/procedures/[id]/route";
const db = getPrisma();
const ids: string[] = [];
beforeAll(async () => {
  assertLocalDevelopmentDatabase(getDatabaseUrl());
  await seedProcedureGuides(db);
  invalidateProcedureCache();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await db.medicalProcedure.deleteMany({ where: { id: { in: ids } } });
  ids.length = 0;
  invalidateProcedureCache();
});
afterAll(() => db.$disconnect());
async function fixture(active = true) {
  const id = randomUUID();
  ids.push(id);
  return db.medicalProcedure.create({
    data: {
      ...procedureGuides[0],
      id,
      code: `TEST-${id}`,
      recommendedInterval: "상담 필요",
      minPriceKrw: 123,
      maxPriceKrw: 456,
      isActive: active,
    },
  });
}
const request = (query = "") => new Request(`http://localhost/api/v1/catalog/procedures${query}`);
const detailRequest = (id: string) =>
  detail(new Request(`http://localhost/api/v1/catalog/procedures/${id}`), {
    params: Promise.resolve({ id }),
  });
describe("public procedure catalog", () => {
  it("returns ten guides, filters every concern, and does not expose internal price evidence", async () => {
    const response = await list(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.total).toBe(10);
    expect(body.data.procedures.map((p: { code: string }) => p.code)).toEqual(
      procedureGuides.map((p) => p.code),
    );
    for (const concern of new Set(procedureGuides.map((p) => p.concernType))) {
      const filtered = await (await list(request(`?concern=${concern}`))).json();
      expect(filtered.data.procedures.length).toBeGreaterThan(0);
      expect(
        filtered.data.procedures.every((p: { concernType: string }) => p.concernType === concern),
      ).toBe(true);
    }
    expect(JSON.stringify(body)).not.toMatch(/priceObservations|sourceUrl|sampleKey|createdAt/);
  });
  it("keeps seeding idempotent and preserves existing guide data", async () => {
    const before = await db.medicalProcedure.findMany({
      where: { code: { in: procedureGuides.map((p) => p.code) } },
    });
    await seedProcedureGuides(db);
    expect(
      await db.medicalProcedure.findMany({ where: { id: { in: before.map((p) => p.id) } } }),
    ).toEqual(before);
  });
  it.each([
    "?concern=UNKNOWN",
    "?concern=",
    "?concern=PIGMENTATION&concern=ELASTICITY",
    "?userId=other",
  ])("rejects invalid query %s before accessing the catalog", async (query) => {
    const lookup = vi.spyOn(db.medicalProcedure, "findMany");
    const response = await list(request(query));
    expect(response.status).toBe(400);
    expect(lookup).not.toHaveBeenCalled();
  });
  it("suppresses legacy prices without evidence and excludes inactive and incomplete legacy rows", async () => {
    const row = await fixture();
    const inactive = await fixture(false);
    const legacy = await fixture();
    await db.medicalProcedure.update({ where: { id: legacy.id }, data: { code: null } });
    expect(await getProcedure(row.id)).toMatchObject({
      priceMinKrw: null,
      priceMaxKrw: null,
      priceSummary: { status: "UNVERIFIED" },
    });
    expect(await getProcedure(inactive.id)).toBeNull();
    expect(await getProcedure(legacy.id)).toBeNull();
    expect((await detailRequest(row.id)).status).toBe(200);
    expect((await detailRequest(inactive.id)).status).toBe(404);
  });
  it.each(["not-an-id", "00000000-0000-4000-8000-999999999999"])(
    "returns the standard 404 for absent id %s",
    async (id) => {
      const response = await detailRequest(id);
      expect(response.status).toBe(404);
      expect((await response.json()).error.code).toBe("PROCEDURE_NOT_FOUND");
    },
  );
  it("computes evidence-backed sample statistics and projects no source links", async () => {
    const row = await fixture();
    await db.medicalProcedure.update({
      where: { id: row.id },
      data: {
        priceBasis: "테스트 동일 조건 1회",
        priceObservations: [
          {
            platform: "YEOSHIN",
            sourceUrl: "https://www.yeoshin.co.kr/test-fixture",
            sampleKey: "c".repeat(64),
            amountKrw: 10000,
            vatIncluded: false,
            observedOn: "2026-11-17",
            basis: "테스트 동일 조건 1회",
          },
        ],
      },
    });
    const response = await detailRequest(row.id);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.procedure).toMatchObject({
      priceMinKrw: 11000,
      priceMaxKrw: 11000,
      priceSummary: { meanKrw: 11000, sampleCount: 1, platforms: ["여신티켓"] },
    });
    expect(JSON.stringify(body)).not.toContain("sourceUrl");
  });
  it("reports invalid evidence as a safe failure and does not cache it as success", async () => {
    const row = await fixture();
    await db.medicalProcedure.update({
      where: { id: row.id },
      data: { priceObservations: [{ amountKrw: 0 }] },
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await list(request());
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("PROCEDURES_UNAVAILABLE");
    expect(error).toHaveBeenCalled();
    await db.medicalProcedure.update({ where: { id: row.id }, data: { priceObservations: [] } });
    expect((await list(request())).status).toBe(200);
  });
  it("coalesces requests, serves cached reads within 300ms, and invalidates after changes", async () => {
    const row = await fixture();
    const lookup = vi.spyOn(db.medicalProcedure, "findMany");
    await Promise.all([getProcedures(), getProcedures("PIGMENTATION"), getProcedure(row.id)]);
    expect(lookup).toHaveBeenCalledTimes(1);
    const elapsed: number[] = [];
    for (let i = 0; i < 20; i++) {
      const start = performance.now();
      expect((await list(request())).status).toBe(200);
      elapsed.push(performance.now() - start);
    }
    expect(Math.max(...elapsed)).toBeLessThan(300);
    await db.medicalProcedure.update({ where: { id: row.id }, data: { isActive: false } });
    invalidateProcedureCache();
    expect(await getProcedure(row.id)).toBeNull();
  });
});
