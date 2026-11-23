import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { getPrisma } from "@/lib/prisma";
import { assertLocalDevelopmentDatabase } from "@/lib/database-development";
import { getDatabaseUrl } from "@/lib/server-env";
import { importInactiveAffiliateProducts } from "@/lib/catalog/product-import";
import { affiliateManifestFixture } from "../fixtures/affiliate-products";
const db = getPrisma();
const ids: string[] = [];
beforeAll(() => assertLocalDevelopmentDatabase(getDatabaseUrl()));
afterEach(async () => {
  await db.product.deleteMany({ where: { id: { in: ids } } });
  ids.length = 0;
  vi.unstubAllEnvs();
});
afterAll(() => db.$disconnect());
function setup() {
  vi.stubEnv("AFFILIATE_PARTNER_ID", "fixture-issued-partner");
  vi.stubEnv("AFFILIATE_DEFAULT_PLATFORM", "FIXTURE_PLATFORM");
  vi.stubEnv("CATALOG_AFFILIATE_HOSTS", "seller.example.com");
  const m = affiliateManifestFixture();
  ids.push(...m.products.map((p) => p.id));
  return m;
}
it("imports eight inactive records, maps existing enums and preserves repeated records and flags", async () => {
  const manifest = setup();
  expect(await importInactiveAffiliateProducts(db, manifest)).toMatchObject({
    createdInactive: 8,
    preservedExisting: 0,
  });
  const rows = await db.product.findMany({ where: { id: { in: ids } }, orderBy: { id: "asc" } });
  expect(rows.every((p) => !p.isActive && p.status === "UNAVAILABLE")).toBe(true);
  expect([...new Set(rows.map((p) => p.category))].sort()).toEqual([
    "CREAM",
    "SERUM",
    "SUNCARE",
    "TONER",
  ]);
  expect(rows.filter((p) => p.isPrimary)).toHaveLength(4);
  await db.product.update({
    where: { id: rows[0].id },
    data: { isActive: true, status: "ACTIVE" },
  });
  const beforeRepeat = await db.product.findMany({
    where: { id: { in: ids } },
    orderBy: { id: "asc" },
  });
  expect(await importInactiveAffiliateProducts(db, manifest)).toMatchObject({
    createdInactive: 0,
    preservedExisting: 8,
  });
  expect(await db.product.findMany({ where: { id: { in: ids } }, orderBy: { id: "asc" } })).toEqual(
    beforeRepeat,
  );
});
it("rolls back an entire conflicting batch instead of replacing curated records", async () => {
  const manifest = setup();
  await importInactiveAffiliateProducts(db, manifest);
  const changed = affiliateManifestFixture();
  ids.push(...changed.products.map((p) => p.id));
  changed.products[0].id = manifest.products[0].id;
  changed.products[0].productName = "교체 요청";
  const before = await db.product.findUniqueOrThrow({ where: { id: manifest.products[0].id } });
  await expect(importInactiveAffiliateProducts(db, changed)).rejects.toMatchObject({
    code: "EXISTING_PRODUCT_CONFLICT",
  });
  expect(
    await db.product.count({ where: { id: { in: changed.products.slice(1).map((p) => p.id) } } }),
  ).toBe(0);
  expect(await db.product.findUniqueOrThrow({ where: { id: before.id } })).toEqual(before);
});
it("refuses a remote database before querying it", async () => {
  const manifest = setup();
  vi.stubEnv("DATABASE_URL", "postgresql://unused:unused@remote.example.com:5432/production");
  const spy = vi.spyOn(db, "$transaction");
  await expect(importInactiveAffiliateProducts(db, manifest)).rejects.toThrow("isolated local");
  expect(spy).not.toHaveBeenCalled();
  spy.mockRestore();
});
