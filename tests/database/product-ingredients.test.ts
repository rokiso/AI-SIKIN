import { randomUUID, randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { value: jar.get(name) } : undefined),
  }),
}));
import { GET } from "../../app/api/v1/catalog/products/[productId]/ingredients/route";
import { getPrisma } from "@/lib/prisma";
import { assertLocalDevelopmentDatabase } from "@/lib/database-development";
import { getDatabaseUrl } from "@/lib/server-env";
import { createGuestSession } from "@/lib/session/guest-proof";
import { ingredientResponseSchema } from "@/lib/catalog/ingredient-types";
import { sampleCatalogProducts } from "@/lib/catalog/sample-data";
const db = getPrisma(),
  users: string[] = [],
  products: string[] = [],
  sessions: string[] = [],
  rules: string[] = [];
beforeAll(() => assertLocalDevelopmentDatabase(getDatabaseUrl()));
beforeEach(() => vi.stubEnv("CATALOG_LIVE_ENABLED", "1"));
afterEach(async () => {
  vi.restoreAllMocks();
  jar.clear();
  vi.unstubAllEnvs();
  await db.diagnosticSession.deleteMany({ where: { id: { in: sessions } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.product.deleteMany({ where: { id: { in: products } } });
  await db.ingredientCautionRule.deleteMany({ where: { id: { in: rules } } });
  users.length = products.length = sessions.length = rules.length = 0;
});
afterAll(() => db.$disconnect());
const call = (id: string, query = "", headers: Record<string, string> = {}) =>
  GET(
    new Request(`https://sikin.test/api/v1/catalog/products/${id}/ingredients${query}`, {
      headers,
    }),
    { params: Promise.resolve({ productId: id }) },
  );
async function product(full = "정제수, Glycerin, Panthenol, Alcohol Denat., 1,2-Hexanediol") {
  const p = await db.product.create({
    data: {
      ...sampleCatalogProducts[0],
      id: randomUUID(),
      brandName: "검증용 브랜드",
      productName: "검증용 크림",
      isActive: true,
      fullIngredients: full,
    },
  });
  products.push(p.id);
  return p;
}
async function report(guest = false) {
  const user = await db.user.create({ data: { nickname: "성분 검증" } });
  users.push(user.id);
  const token = randomBytes(32).toString("hex");
  await db.authSession.create({
    data: { userId: user.id, sessionToken: token, expiresAt: new Date(Date.now() + 3600000) },
  });
  const capability = createGuestSession();
  const s = await db.diagnosticSession.create({
    data: {
      userId: guest ? null : user.id,
      guestDeviceId: guest ? capability.guestDeviceId : null,
      status: "COMPLETED",
      surveyAnswers: {},
      axisScores: {},
      report: {
        create: {
          baumannType: "OSNW",
          oilinessScore: 50,
          sensitivityScore: 50,
          pigmentationScore: 50,
          elasticityScore: 50,
          summaryText: "비공개 요약",
          recommendedIngredients: ["판테놀"],
          cautionIngredients: ["향료"],
          aiAuditMetadata: {},
        },
      },
    },
    include: { report: true },
  });
  sessions.push(s.id);
  return { user, token, capability, reportId: s.report!.id };
}
it("returns public bounded projection and stable label order, never seller URL or raw rule rows", async () => {
  const p = await product();
  const response = await call(p.id, "?baumannType=OSNW");
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  const body = ingredientResponseSchema.parse(await response.json());
  expect(body.data.fullIngredients).toEqual([
    "정제수",
    "Glycerin",
    "Panthenol",
    "Alcohol Denat.",
    "1,2-Hexanediol",
  ]);
  expect(body.data.cautionIngredients[0].nameKo).toBe("변성알코올");
  expect(body.data.ingredientsSummary).toMatchObject({ totalCount: 5, cautionCount: 1 });
  expect(JSON.stringify(body)).not.toMatch(/affiliateBaseUrl|createdAt|targetUrl|비공개 요약/);
  expect(
    (await ingredientResponseSchema.parse(await (await call(p.id, "?baumannType=ORNT")).json()))
      .data.cautionIngredients,
  ).toEqual([]);
});
it("uses only the member's own latest report and validates an explicit report's owner", async () => {
  const p = await product();
  const a = await report(),
    b = await report();
  jar.set("app_session_token", a.token);
  const data = ingredientResponseSchema.parse(await (await call(p.id)).json()).data;
  expect(data.targetBaumannType).toBe("OSNW");
  expect(data.typeSource).toBe("REPORT");
  expect(data.beneficialIngredients.find((i) => i.nameKo === "판테놀")?.isTargetMatched).toBe(true);
  expect((await call(p.id, `?reportId=${b.reportId}`)).status).toBe(404);
  expect((await call(p.id, `?reportId=${a.reportId}`)).status).toBe(200);
  const selected = ingredientResponseSchema.parse(
    await (await call(p.id, "?baumannType=ORNT")).json(),
  ).data;
  expect(selected.typeSource).toBe("SELECTED");
  expect(selected.beneficialIngredients.every((i) => !i.isTargetMatched)).toBe(true);
});
it("reads a signed guest's own report but never raw UUID headers or invalid member tokens", async () => {
  const p = await product();
  const f = await report(true);
  const spoof = ingredientResponseSchema.parse(
    await (await call(p.id, "", { "x-guest-session-id": f.capability.guestDeviceId })).json(),
  ).data;
  expect(spoof.targetBaumannType).toBeNull();
  jar.set("x-guest-session-id", f.capability.guestDeviceId);
  jar.set("sikin_guest_proof", f.capability.proof);
  expect(ingredientResponseSchema.parse(await (await call(p.id)).json()).data.typeSource).toBe(
    "REPORT",
  );
  jar.clear();
  jar.set("app_session_token", randomBytes(32).toString("hex"));
  expect(
    ingredientResponseSchema.parse(await (await call(p.id)).json()).data.targetBaumannType,
  ).toBeNull();
});
it("does not fabricate a complete list from ingredient tags and hides inactive products", async () => {
  const p = await product("");
  const body = ingredientResponseSchema.parse(await (await call(p.id)).json());
  expect(body.data.fullIngredients).toEqual([]);
  expect(body.data.beneficialIngredients).toEqual([]);
  await db.product.update({ where: { id: p.id }, data: { isActive: false } });
  expect((await call(p.id)).status).toBe(404);
  expect((await call(randomUUID())).status).toBe(404);
});
it("rejects malformed paths, codes, extra or duplicated parameters", async () => {
  const p = await product();
  expect((await call("not-an-id")).status).toBe(400);
  for (const q of [
    "?baumannType=BAD",
    "?baumannType=OSNW&baumannType=ORNT",
    "?userId=foreign",
    "?reportId=bad",
  ])
    expect((await call(p.id, q)).status).toBe(400);
});
it("exposes a clearly identified preview using only fictional data when the live catalog is disabled", async () => {
  vi.stubEnv("CATALOG_LIVE_ENABLED", "0");
  const spy = vi.spyOn(db.product, "findFirst");
  const body = ingredientResponseSchema.parse(
    await (await call(sampleCatalogProducts[0].id, "?baumannType=OSNW")).json(),
  );
  expect(body.data.isDemo).toBe(true);
  expect(spy).not.toHaveBeenCalled();
  expect((await call(randomUUID())).status).toBe(404);
});
it("reports DB failures and unreviewed therapeutic rule copy safely", async () => {
  const p = await product();
  const spy = vi
    .spyOn(db.ingredientCautionRule, "findMany")
    .mockRejectedValueOnce(new Error("private-database-details"));
  const res = await call(p.id);
  expect(res.status).toBe(503);
  expect(JSON.stringify(await res.json())).not.toContain("private-database-details");
  spy.mockRestore();
  const r = await db.ingredientCautionRule.create({
    data: {
      standardName: `검증-${randomUUID()}`,
      targetAxis: "ALL",
      reasonKo: "피부 질환 치료",
      descriptionKo: "검증",
    },
  });
  rules.push(r.id);
  expect((await call(p.id)).status).toBe(503);
});
