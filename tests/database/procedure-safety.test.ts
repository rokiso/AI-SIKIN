import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { getPrisma } from "@/lib/prisma";
import { getDatabaseUrl } from "@/lib/server-env";
import { assertLocalDevelopmentDatabase } from "@/lib/database-development";
import { rfMicroneedlingRiskNote, seedProcedureGuides } from "@/prisma/seeds/procedures";
import { seedProcedureSafetyGuides } from "@/prisma/seeds/procedure-safety";
import { GET } from "../../app/api/v1/catalog/procedures/[id]/route";
import { getProcedureSafetyGuide } from "@/lib/catalog/procedure-safety-service";
import { invalidateProcedureCache } from "@/lib/catalog/procedureService";
import { enforceSafetyRateLimit } from "@/lib/catalog/procedure-safety-rate-limit";
import { procedureSafetyRoutes, safetyResponseSchema } from "@/lib/catalog/procedure-safety-types";
const db = getPrisma();
let existingKeys = new Set<string>();
let ip = "";
const call = (slug: string, query = "") =>
  GET(
    new Request(`https://sikin.test/api/v1/catalog/procedures/${slug}${query}`, {
      headers: { "x-real-ip": ip },
    }),
    { params: Promise.resolve({ id: slug }) },
  );
beforeAll(async () => {
  assertLocalDevelopmentDatabase(getDatabaseUrl());
  await seedProcedureGuides(db);
  await seedProcedureSafetyGuides(db);
});
beforeEach(async () => {
  vi.stubEnv("PROCEDURE_CATALOG_SOURCE", "database");
  vi.stubEnv("CONSENT_TRUSTED_IP_HEADER", "x-real-ip");
  const hex = randomBytes(4).toString("hex");
  ip = `2001:db8:${hex.slice(0, 4)}:${hex.slice(4)}::1`;
  existingKeys = new Set(
    (await db.procedureSafetyRateLimit.findMany({ select: { keyHash: true } })).map(
      (r) => r.keyHash,
    ),
  );
  invalidateProcedureCache();
});
afterEach(async () => {
  vi.restoreAllMocks();
  const keys = (await db.procedureSafetyRateLimit.findMany({ select: { keyHash: true } }))
    .map((r) => r.keyHash)
    .filter((k) => !existingKeys.has(k));
  await db.procedureSafetyRateLimit.deleteMany({ where: { keyHash: { in: keys } } });
  vi.unstubAllEnvs();
  invalidateProcedureCache();
});
afterAll(() => db.$disconnect());
it("returns safety, post care, questions and existing price evidence for all ten public slugs", async () => {
  for (const route of procedureSafetyRoutes) {
    const response = await call(route.slug);
    expect(response.status).toBe(200);
    const data = safetyResponseSchema.parse(await response.json()).data;
    expect(data.slug).toBe(route.slug);
    expect(data.readiness).toBe("READY");
    expect(data.defenseQuestions).toHaveLength(3);
    expect(data.safetyInfo.postCareInstructions).toHaveLength(3);
    expect(data.scientificPrinciple.length).toBeGreaterThan(30);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(JSON.stringify(data)).not.toMatch(/procedureId|sourceUrl|sampleKey|createdAt|userId/);
  }
  const pico = safetyResponseSchema.parse(await (await call("pico-toning")).json()).data;
  expect(pico.safetyInfo.commonSideEffects).toHaveLength(3);
});
it("keeps the original UUID API envelope and rejects invalid routes or queries", async () => {
  const row = await db.medicalProcedure.findUniqueOrThrow({ where: { code: "P-PICO" } });
  const original = await call(row.id);
  expect(original.status).toBe(200);
  expect((await original.json()).data.procedure.code).toBe("P-PICO");
  expect((await call("does-not-exist")).status).toBe(404);
  expect((await call("pico-toning", "?userId=someone")).status).toBe(400);
});
it("preserves seeded guides, observations and update times across repeat seeding", async () => {
  const before = await db.procedureSafetyGuide.findMany({ orderBy: { slug: "asc" } });
  const prices = await db.medicalProcedure.findMany({
    select: { code: true, priceObservations: true },
    orderBy: { code: "asc" },
  });
  await seedProcedureSafetyGuides(db);
  expect(await db.procedureSafetyGuide.findMany({ orderBy: { slug: "asc" } })).toEqual(before);
  expect(
    await db.medicalProcedure.findMany({
      select: { code: true, priceObservations: true },
      orderBy: { code: "asc" },
    }),
  ).toEqual(prices);
});
it("adds the scoped RF warning to existing records without replacing curated data or duplicating it", async () => {
  const sql = await readFile(
    new URL(
      "../../prisma/migrations/20261119030000_rf_microneedling_risk_note/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const rollback = new Error("ROLLBACK_RF_MIGRATION_TEST");
  await expect(
    db.$transaction(async (tx) => {
      // Exercise the actual migration against legacy/custom content; roll back all fixtures.
      const parent = await tx.medicalProcedure.update({
        where: { code: "P-RF" },
        data: { sideEffects: ["기존에 검토한 별도 주의사항"] },
      });
      const guide = await tx.procedureSafetyGuide.update({
        where: { slug: "rf-tightening" },
        data: { rareRisks: ["기존에 검토한 상세 위험"] },
      });
      const others = await tx.medicalProcedure.findMany({
        where: { code: { not: "P-RF" } },
        orderBy: { id: "asc" },
        include: { safetyGuide: true },
      });
      await tx.$executeRawUnsafe(sql);
      const updatedParent = await tx.medicalProcedure.findUniqueOrThrow({
        where: { id: parent.id },
      });
      const updatedGuide = await tx.procedureSafetyGuide.findUniqueOrThrow({
        where: { id: guide.id },
      });
      expect(updatedParent).toEqual({
        ...parent,
        sideEffects: [...parent.sideEffects, rfMicroneedlingRiskNote],
        updatedAt: expect.any(Date),
      });
      expect(updatedGuide).toEqual({
        ...guide,
        rareRisks: [...guide.rareRisks, rfMicroneedlingRiskNote],
        updatedAt: expect.any(Date),
      });
      expect(
        await tx.medicalProcedure.findMany({
          where: { code: { not: "P-RF" } },
          orderBy: { id: "asc" },
          include: { safetyGuide: true },
        }),
      ).toEqual(others);
      await tx.$executeRawUnsafe(sql);
      expect(await tx.medicalProcedure.findUniqueOrThrow({ where: { id: parent.id } })).toEqual(
        updatedParent,
      );
      expect(await tx.procedureSafetyGuide.findUniqueOrThrow({ where: { id: guide.id } })).toEqual(
        updatedGuide,
      );
      throw rollback;
    }),
  ).rejects.toBe(rollback);
});
it("serves the scoped RF warning from both catalog sources and the legacy UUID contract", async () => {
  for (const source of ["database", "published"]) {
    vi.stubEnv("PROCEDURE_CATALOG_SOURCE", source);
    invalidateProcedureCache();
    const response = await call("rf-tightening");
    expect(response.status).toBe(200);
    const data = safetyResponseSchema.parse(await response.json()).data;
    expect(data.safetyInfo.rareRisks.filter((r) => r === rfMicroneedlingRiskNote)).toHaveLength(1);
    const { procedures } = await import("@/lib/catalog/procedureService").then((m) =>
      m.getProcedures(),
    );
    const rf = procedures.find((p) => p.code === "P-RF")!;
    const legacy = await call(rf.id);
    expect(legacy.status).toBe(200);
    expect((await legacy.json()).data.procedure.sideEffectsWarning).toContain(
      rfMicroneedlingRiskNote,
    );
    const pico = safetyResponseSchema.parse(await (await call("pico-toning")).json()).data;
    expect(pico.safetyInfo.rareRisks).not.toContain(rfMicroneedlingRiskNote);
  }
});
it("enforces 120 requests atomically across concurrent callers with no raw IP retention", async () => {
  const headers = new Headers({ "x-real-ip": ip });
  const now = new Date("2020-01-01T00:00:01Z");
  const result = await Promise.allSettled(
    Array.from({ length: 121 }, () => enforceSafetyRateLimit(headers, now)),
  );
  expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(120);
  const failed = result.filter((r) => r.status === "rejected");
  expect(failed).toHaveLength(1);
  if (failed[0].status === "rejected")
    expect(failed[0].reason).toMatchObject({ status: 429, retryAfter: 59 });
  const rows = await db.procedureSafetyRateLimit.findMany();
  expect(JSON.stringify(rows)).not.toContain(ip);
  expect(rows.some((r) => r.requestCount === 121)).toBe(true);
  await expect(
    enforceSafetyRateLimit(headers, new Date("2020-01-01T00:01:01Z")),
  ).resolves.toBeUndefined();
});
it("does not trust spoofed forwarding headers without an ingress configuration", async () => {
  vi.stubEnv("CONSENT_TRUSTED_IP_HEADER", undefined);
  const now = new Date("2020-01-02T00:00:01Z");
  await enforceSafetyRateLimit(new Headers({ "x-forwarded-for": "198.51.100.1" }), now);
  await enforceSafetyRateLimit(new Headers({ "x-forwarded-for": "198.51.100.2" }), now);
  const rows = await db.procedureSafetyRateLimit.findMany({
    where: { expiresAt: new Date("2020-01-02T00:02:00Z") },
  });
  expect(rows).toHaveLength(1);
  expect(rows[0].requestCount).toBe(2);
});
it("returns a safe 429 with Retry-After and never treats quota failures as success", async () => {
  const headers = new Headers({ "x-real-ip": ip });
  await Promise.all(Array.from({ length: 120 }, () => enforceSafetyRateLimit(headers)));
  const response = await call("pico-toning");
  expect(response.status).toBe(429);
  expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
  expect((await response.json()).error.code).toBe("PROCEDURE_RATE_LIMITED");
});
it("distinguishes unpublished guide content from a failed database read", async () => {
  vi.spyOn(db.procedureSafetyGuide, "findFirst").mockResolvedValueOnce(null);
  const data = await getProcedureSafetyGuide("pico-toning");
  expect(data?.readiness).toBe("PREPARING");
  expect(data?.defenseQuestions).toEqual([]);
  const stored = await db.procedureSafetyGuide.findUniqueOrThrow({
    where: { slug: "pico-toning" },
  });
  vi.spyOn(db.procedureSafetyGuide, "findFirst").mockResolvedValueOnce({
    ...stored,
    contraindications: [],
  });
  expect((await getProcedureSafetyGuide("pico-toning"))?.readiness).toBe("PREPARING");
  vi.spyOn(db.procedureSafetyGuide, "findFirst").mockRejectedValueOnce(
    new Error("private-database-error"),
  );
  const response = await call("pico-toning");
  expect(response.status).toBe(503);
  expect(JSON.stringify(await response.json())).not.toContain("private-database-error");
});
it("uses the versioned published content without querying the safety table", async () => {
  vi.stubEnv("PROCEDURE_CATALOG_SOURCE", "published");
  const read = vi.spyOn(db.procedureSafetyGuide, "findFirst");
  const response = await call("pico-toning");
  expect(response.status).toBe(200);
  expect(response.headers.get("x-procedure-catalog-source")).toBe("published");
  expect(read).not.toHaveBeenCalled();
});
it("serves warm detail reads within the required one-second local budget", async () => {
  await call("pico-toning");
  for (let i = 0; i < 10; i++) {
    const start = performance.now();
    expect((await call("pico-toning")).status).toBe(200);
    expect(performance.now() - start).toBeLessThan(1000);
  }
});
