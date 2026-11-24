import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = jar.get(name);
      return value ? { value } : undefined;
    },
  }),
}));
import { getPrisma } from "../../lib/prisma";
import { getDatabaseUrl } from "../../lib/server-env";
import { assertLocalDevelopmentDatabase } from "../../lib/database-development";
import { createGuestSession } from "../../lib/session/guest-proof";
import { sampleCatalogProducts } from "../../lib/catalog/sample-data";
import {
  getProductRecommendations,
  getLatestCatalogReportId,
  invalidateProductCache,
  recordAffiliateRedirect,
} from "../../lib/catalog/curationService";
import { checkProductLinks } from "../../lib/catalog/affiliate-health-batch";
import type { LinkProbe } from "../../lib/catalog/linkHealthChecker";
import { POST as healthCheck } from "../../app/api/v1/catalog/health-check/route";
import * as ingredientRepository from "../../lib/catalog/ingredient-repository";
import { GET as recommendations } from "../../app/api/v1/catalog/products/recommendations/route";
import { GET as redirect } from "../../app/api/v1/catalog/redirect/route";
import type { VerifiedIdentity } from "../../lib/session/identity-types";
const prisma = getPrisma();
const users: string[] = [],
  sessions: string[] = [],
  products: string[] = [];
beforeAll(() => {
  assertLocalDevelopmentDatabase(getDatabaseUrl());
});
beforeEach(() => {
  vi.stubEnv("CATALOG_LIVE_ENABLED", "1");
  vi.stubEnv("CATALOG_AFFILIATE_HOSTS", "shop.example.com");
  invalidateProductCache();
  jar.clear();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await prisma.affiliateLinkHealthLog.deleteMany({ where: { productId: { in: products } } });
  await prisma.affiliateClickLog.deleteMany({ where: { productId: { in: products } } });
  await prisma.diagnosticSession.deleteMany({ where: { id: { in: sessions } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.product.deleteMany({ where: { id: { in: products } } });
  users.length = sessions.length = products.length = 0;
  invalidateProductCache();
  jar.clear();
  vi.unstubAllEnvs();
});
afterAll(() => prisma.$disconnect());
async function fixture(guest = false) {
  const user = await prisma.user.create({ data: { nickname: "큐레이션 검증 회원" } });
  users.push(user.id);
  const token = randomBytes(32).toString("hex");
  await prisma.authSession.create({
    data: { userId: user.id, sessionToken: token, expiresAt: new Date(Date.now() + 3_600_000) },
  });
  const guestSession = createGuestSession();
  const session = await prisma.diagnosticSession.create({
    data: {
      userId: guest ? null : user.id,
      guestDeviceId: guest ? guestSession.guestDeviceId : null,
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
          summaryText: "검증용",
          recommendedIngredients: ["판테놀"],
          cautionIngredients: [],
          aiAuditMetadata: {},
        },
      },
    },
    include: { report: true },
  });
  sessions.push(session.id);
  const reportId = session.report!.id;
  const member: VerifiedIdentity = {
    kind: "member",
    userId: user.id,
    nickname: user.nickname,
    role: "USER",
    guestDeviceId: null,
  };
  const identity: VerifiedIdentity = guest
    ? { kind: "guest", guestDeviceId: guestSession.guestDeviceId }
    : member;
  const catalog = sampleCatalogProducts.slice(0, 8).map((p) => ({
    ...p,
    id: randomUUID(),
    isActive: true,
    affiliateBaseUrl: `https://shop.example.com/item/${randomUUID()}?partner=registered`,
  }));
  products.push(...catalog.map((p) => p.id));
  await prisma.product.createMany({ data: catalog });
  if (guest) {
    jar.set("x-guest-session-id", guestSession.guestDeviceId);
    jar.set("sikin_guest_proof", guestSession.proof);
  } else jar.set("app_session_token", token);
  return { user, reportId, identity, catalog, token, guestSession };
}
const recRequest = (reportId: string) =>
  new Request(`http://localhost/api/v1/catalog/products/recommendations?reportId=${reportId}`);
const redirectRequest = (productId: string, reportId?: string) =>
  new Request(
    `http://localhost/api/v1/catalog/redirect?${new URLSearchParams({ productId, ...(reportId ? { reportId } : {}) })}`,
    { headers: { "user-agent": "catalog-test" } },
  );
describe("catalog APIs against local PostgreSQL", () => {
  it("blocks live catalog APIs by default without authorizing or reading new tables", async () => {
    vi.stubEnv("CATALOG_LIVE_ENABLED", "");
    const response = await recommendations(recRequest(randomUUID()));
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("CATALOG_PREVIEW_ONLY");
    const redirected = await redirect(redirectRequest(randomUUID()));
    expect(redirected.status).toBe(302);
    expect(redirected.headers.get("location")).toBe("/catalog/redirect/error");
  });
  it("creates eight consistent mappings, enforces owner access and validates selectors", async () => {
    const f = await fixture();
    expect(await getLatestCatalogReportId(f.identity)).toBe(f.reportId);
    expect(await getLatestCatalogReportId({ kind: "anonymous" })).toBeNull();
    const response = await recommendations(recRequest(f.reportId));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = await response.json();
    expect(body.data.categories).toHaveLength(4);
    expect(
      body.data.categories.every(
        (c: { primaryProduct: unknown; secondaryProduct: unknown }) =>
          c.primaryProduct && c.secondaryProduct,
      ),
    ).toBe(true);
    expect(await prisma.productRecommendation.count({ where: { reportId: f.reportId } })).toBe(8);
    jar.clear();
    expect((await recommendations(recRequest(f.reportId))).status).toBe(404);
    jar.set("app_session_token", randomBytes(32).toString("hex"));
    expect((await recommendations(recRequest(f.reportId))).status).toBe(404);
    expect((await recommendations(recRequest("not-a-uuid"))).status).toBe(400);
    expect(
      (
        await recommendations(
          new Request(
            `http://localhost/api/v1/catalog/products/recommendations?reportId=${f.reportId}&userId=${f.user.id}`,
          ),
        )
      ).status,
    ).toBe(400);
  });
  it("authorizes signed guests but never guest UUID alone or another account", async () => {
    const f = await fixture(true);
    // Use the shared cookie constant to test the existing proof contract.
    const { GUEST_PROOF_COOKIE_NAME } = await import("../../lib/session/guest-proof");
    jar.set(GUEST_PROOF_COOKIE_NAME, f.guestSession.proof);
    expect((await recommendations(recRequest(f.reportId))).status).toBe(200);
    jar.delete(GUEST_PROOF_COOKIE_NAME);
    expect((await recommendations(recRequest(f.reportId))).status).toBe(404);
    const stranger = await prisma.user.create({ data: { nickname: "다른 회원" } });
    users.push(stranger.id);
    await expect(
      getProductRecommendations(f.reportId, {
        kind: "member",
        userId: stranger.id,
        nickname: stranger.nickname,
        role: "USER",
        guestDeviceId: f.guestSession.guestDeviceId,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("logs one successful click before a 302, replacing tracking without exporting report identity", async () => {
    const f = await fixture();
    const response = await redirect(redirectRequest(f.catalog[0].id, f.reportId));
    expect(response.status).toBe(302);
    const target = new URL(response.headers.get("location")!);
    expect(target.hostname).toBe("shop.example.com");
    expect(target.searchParams.get("utm_source")).toBe("aiskin");
    expect(target.searchParams.get("partner")).toBe("registered");
    expect(target.href).not.toContain(f.reportId);
    const log = await prisma.affiliateClickLog.findUnique({
      where: { id: target.searchParams.get("click_id")! },
    });
    expect(log).toMatchObject({
      productId: f.catalog[0].id,
      userId: f.user.id,
      reportId: f.reportId,
      targetUrl: target.href,
    });
    expect(await prisma.affiliateClickLog.count({ where: { reportId: f.reportId } })).toBe(1);
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });
  it("falls back to the same-category secondary for out-of-stock and disabled primary", async () => {
    const f = await fixture();
    await getProductRecommendations(f.reportId, f.identity);
    await prisma.product.update({
      where: { id: f.catalog[0].id },
      data: { status: "OUT_OF_STOCK" },
    });
    invalidateProductCache();
    expect(
      (await getProductRecommendations(f.reportId, f.identity)).categories[0].isFallbackActive,
    ).toBe(true);
    const location = await recordAffiliateRedirect(
      { productId: f.catalog[0].id, reportId: f.reportId, tier: "PRIMARY" },
      f.identity,
      "test",
    );
    expect(location).toContain(new URL(f.catalog[4].affiliateBaseUrl).pathname);
    await prisma.product.update({ where: { id: f.catalog[0].id }, data: { isActive: false } });
    expect(
      await recordAffiliateRedirect(
        { productId: f.catalog[0].id, reportId: f.reportId, tier: "PRIMARY" },
        f.identity,
        "test",
      ),
    ).toContain(new URL(f.catalog[4].affiliateBaseUrl).pathname);
    expect(
      (await prisma.affiliateClickLog.findMany({ where: { reportId: f.reportId } })).every(
        (r) => r.productId === f.catalog[4].id && r.tier === "SECONDARY",
      ),
    ).toBe(true);
  });
  it("fails safely for unknown, tampered, unapproved and both-unavailable products without logging", async () => {
    const f = await fixture();
    for (const request of [
      redirectRequest(randomUUID()),
      new Request("http://localhost/api/v1/catalog/redirect?url=https://evil.example"),
      new Request(
        `http://localhost/api/v1/catalog/redirect?productId=${f.catalog[0].id}&tier=SECONDARY&reportId=${f.reportId}`,
      ),
    ])
      expect((await redirect(request)).headers.get("location")).toBe("/catalog/redirect/error");
    await prisma.product.update({
      where: { id: f.catalog[0].id },
      data: { affiliateBaseUrl: "https://evil.example/" },
    });
    expect((await redirect(redirectRequest(f.catalog[0].id))).headers.get("location")).toBe(
      "/catalog/redirect/error",
    );
    await prisma.product.updateMany({
      where: { id: { in: [f.catalog[0].id, f.catalog[4].id] } },
      data: { status: "UNAVAILABLE" },
    });
    expect(
      (await redirect(redirectRequest(f.catalog[0].id, f.reportId))).headers.get("location"),
    ).toBe("/catalog/redirect/error");
    expect(await prisma.affiliateClickLog.count({ where: { productId: { in: products } } })).toBe(
      0,
    );
  });
  it("rechecks live session ownership on warm cache and handles a missing report", async () => {
    const f = await fixture();
    await recommendations(recRequest(f.reportId));
    await prisma.authSession.deleteMany({ where: { userId: f.user.id } });
    expect((await recommendations(recRequest(f.reportId))).status).toBe(404);
    expect((await recommendations(recRequest(randomUUID()))).status).toBe(404);
    expect(
      (await redirect(redirectRequest(f.catalog[0].id, f.reportId))).headers.get("location"),
    ).toContain("/catalog/redirect/error");
  });
  it("handles concurrent lazy generation and profiles 50 warm authorized API requests", async () => {
    const f = await fixture();
    await Promise.all(
      Array.from({ length: 5 }, () => getProductRecommendations(f.reportId, f.identity)),
    );
    expect(await prisma.productRecommendation.count({ where: { reportId: f.reportId } })).toBe(8);
    const transactions = vi.spyOn(prisma, "$transaction");
    const sessionReads = vi.spyOn(prisma.authSession, "findFirst");
    const reportReads = vi.spyOn(prisma.diagnosticReport, "findFirst");
    const timings = await Promise.all(
      Array.from({ length: 50 }, async () => {
        const start = performance.now();
        expect((await recommendations(recRequest(f.reportId))).status).toBe(200);
        return performance.now() - start;
      }),
    );
    timings.sort((a, b) => a - b);
    const p95 = timings[Math.ceil(timings.length * 0.95) - 1];
    console.info(
      `[catalog-test] local warm API p95 ${p95.toFixed(1)}ms (50 concurrent), transactions ${transactions.mock.calls.length}`,
    );
    expect(transactions).not.toHaveBeenCalled();
    expect(sessionReads).toHaveBeenCalledTimes(50);
    expect(reportReads).toHaveBeenCalledTimes(50);
    expect(p95).toBeLessThan(300);
  });
  it("checks foreign ownership and revoked sessions even while a recommendation load is pending", async () => {
    const f = await fixture();
    const stranger = await prisma.user.create({ data: { nickname: "별도 사용자" } });
    users.push(stranger.id);
    const gate = Promise.withResolvers<void>();
    const entered = Promise.withResolvers<void>();
    const original = ingredientRepository.getIngredientRules;
    vi.spyOn(ingredientRepository, "getIngredientRules").mockImplementationOnce(async () => {
      entered.resolve();
      await gate.promise;
      return original();
    });
    const pending = getProductRecommendations(f.reportId, f.identity);
    try {
      await entered.promise;
      await expect(
        getProductRecommendations(f.reportId, {
          ...f.identity,
          kind: "member",
          userId: stranger.id,
          nickname: stranger.nickname,
          role: "USER",
          guestDeviceId: null,
        }),
      ).rejects.toMatchObject({ status: 404 });
      await prisma.authSession.deleteMany({ where: { userId: f.user.id } });
      expect((await recommendations(recRequest(f.reportId))).status).toBe(404);
    } finally {
      gate.resolve();
      await pending;
    }
  });
  it("refreshes catalog data and repairs mapping metadata after a completed load", async () => {
    const f = await fixture();
    await getProductRecommendations(f.reportId, f.identity);
    const mapping = await prisma.productRecommendation.findFirstOrThrow({
      where: { reportId: f.reportId },
    });
    await prisma.productRecommendation.update({
      where: { id: mapping.id },
      data: { targetIngredients: ["수동 변경"], recommendationReason: "이전 설명" },
    });
    await getProductRecommendations(f.reportId, f.identity);
    const repaired = await prisma.productRecommendation.findFirstOrThrow({
      where: { reportId: f.reportId, category: mapping.category, tier: mapping.tier },
    });
    expect(repaired.targetIngredients).toEqual(mapping.targetIngredients);
    expect(repaired.recommendationReason).toBe(mapping.recommendationReason);
    await prisma.product.updateMany({
      where: { id: { in: f.catalog.map((p) => p.id) } },
      data: { ingredients: ["판테놀", "향료"], fullIngredients: "판테놀, 향료" },
    });
    invalidateProductCache();
    const changed = await getProductRecommendations(f.reportId, f.identity);
    expect(changed.categories.every((c) => !c.primaryProduct && !c.secondaryProduct)).toBe(true);
    expect(await prisma.productRecommendation.count({ where: { reportId: f.reportId } })).toBe(0);
  });
  it("does not mix reports or retain a failed shared load for the next request", async () => {
    const a = await fixture();
    const b = await fixture();
    const results = await Promise.all([
      getProductRecommendations(a.reportId, a.identity),
      getProductRecommendations(b.reportId, b.identity),
    ]);
    expect(results.map((r) => r.reportId)).toEqual([a.reportId, b.reportId]);
    vi.spyOn(ingredientRepository, "getIngredientRules").mockRejectedValueOnce(
      new Error("private-rule-store-failure"),
    );
    const failed = await recommendations(recRequest(b.reportId));
    expect(failed.status).toBe(503);
    expect(JSON.stringify(await failed.json())).not.toContain("private-rule-store-failure");
    expect((await recommendations(recRequest(b.reportId))).status).toBe(200);
  });
  const healthy: LinkProbe = {
    status: "HEALTHY",
    httpStatusCode: 200,
    responseTimeMs: 12,
    errorMessage: null,
  };
  const dead: LinkProbe = {
    ...healthy,
    status: "UNHEALTHY",
    httpStatusCode: 404,
    errorMessage: "HTTP_FAILURE",
  };

  it("switches the current recommendation and redirect after a 404, then recovers the primary", async () => {
    const f = await fixture();
    const primary = f.catalog[0];
    const alternate = f.catalog[4];
    const input = { targetProductId: primary.id };
    const old = await getProductRecommendations(f.reportId, f.identity);
    expect(old.categories[0].primaryProduct?.id).toBe(primary.id);
    const probe = async (url: string) => (url === primary.affiliateBaseUrl ? dead : healthy);
    const dry = await checkProductLinks({ ...input, dryRun: true }, probe);
    expect(dry).toMatchObject({ checkedCount: 1, switchedCount: 0 });
    expect(await prisma.affiliateLinkHealthLog.count({ where: { productId: primary.id } })).toBe(0);
    const result = await checkProductLinks(input, probe);
    expect(result).toMatchObject({ checkedCount: 1, switchedCount: 1 });
    expect(await prisma.product.findUnique({ where: { id: primary.id } })).toMatchObject({
      status: "UNAVAILABLE",
      isActive: true,
      healthCheckFailCount: 1,
    });
    expect(
      await prisma.affiliateLinkHealthLog.findFirst({ where: { productId: primary.id } }),
    ).toMatchObject({
      httpStatusCode: 404,
      fallbackProductId: alternate.id,
      actionTaken: "SWITCHED_TO_FALLBACK",
      checkedUrl: primary.affiliateBaseUrl.split("?")[0],
    });
    const target = await recordAffiliateRedirect(
      { reportId: f.reportId, productId: primary.id, tier: "PRIMARY" },
      f.identity,
      null,
    );
    expect(new URL(target).pathname).toBe(new URL(alternate.affiliateBaseUrl).pathname);
    const refreshed = await getProductRecommendations(f.reportId, f.identity);
    expect(refreshed.categories[0]).toMatchObject({
      isFallbackActive: true,
      secondaryProduct: { id: alternate.id },
    });
    await checkProductLinks(input, async () => healthy);
    expect(await prisma.product.findUnique({ where: { id: primary.id } })).toMatchObject({
      status: "ACTIVE",
      healthCheckFailCount: 0,
    });
  });

  it("does not route a targeted check to a failed alternate", async () => {
    const f = await fixture();
    const primary = f.catalog[0];
    const alternate = f.catalog[4];
    await getProductRecommendations(f.reportId, f.identity);
    const result = await checkProductLinks({ targetProductId: primary.id }, async () => dead);
    expect(result.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ productId: primary.id, actionTaken: "FALLBACK_FAILED" }),
        expect.objectContaining({ productId: alternate.id, status: "UNHEALTHY" }),
      ]),
    );
    const refreshed = await getProductRecommendations(f.reportId, f.identity);
    expect(refreshed.categories[0].isFallbackActive).toBe(false);
    await expect(
      recordAffiliateRedirect(
        { reportId: f.reportId, productId: primary.id, tier: "PRIMARY" },
        f.identity,
        null,
      ),
    ).rejects.toMatchObject({ code: "PRODUCT_UNAVAILABLE" });
  });

  it("preserves the catalog when no affiliate hosts are configured", async () => {
    const { catalog } = await fixture();
    vi.stubEnv("CATALOG_AFFILIATE_HOSTS", "");
    await expect(checkProductLinks({ targetProductId: catalog[0].id })).rejects.toThrow(
      "Affiliate host configuration is missing",
    );
    expect(await prisma.product.findUnique({ where: { id: catalog[0].id } })).toMatchObject({
      status: "ACTIVE",
      healthCheckFailCount: 0,
    });
  });

  it("isolates a timeout without activating an unapproved alternate and preserves stock decisions", async () => {
    const f = await fixture();
    const primary = f.catalog[0];
    await prisma.product.update({ where: { id: f.catalog[4].id }, data: { isActive: false } });
    await prisma.product.update({
      where: { id: f.catalog[1].id },
      data: { status: "OUT_OF_STOCK" },
    });
    const probe = vi.fn(async (url: string): Promise<LinkProbe> =>
      url === primary.affiliateBaseUrl
        ? { ...dead, status: "TIMEOUT", httpStatusCode: null, errorMessage: "DEADLINE_EXCEEDED" }
        : healthy,
    );
    const result = await checkProductLinks({}, probe);
    expect(result.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          productId: primary.id,
          status: "TIMEOUT",
          actionTaken: "FALLBACK_FAILED",
        }),
        expect.objectContaining({ productId: f.catalog[1].id, errorMessage: "OUT_OF_STOCK" }),
        expect.objectContaining({ productId: f.catalog[2].id, status: "HEALTHY" }),
      ]),
    );
    expect(probe).not.toHaveBeenCalledWith(f.catalog[4].affiliateBaseUrl);
    expect(await prisma.product.findUnique({ where: { id: f.catalog[4].id } })).toMatchObject({
      isActive: false,
    });
    expect(await prisma.product.findUnique({ where: { id: f.catalog[1].id } })).toMatchObject({
      status: "OUT_OF_STOCK",
    });
  });

  it("authenticates the scheduler, validates its body and shares the quota across calls", async () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    vi.stubEnv("CRON_SECRET_TOKEN", "local-vitest-cron-token");
    await prisma.affiliateLinkHealthQuota.deleteMany();
    const request = (token?: string, body: unknown = { targetProductId: randomUUID() }) =>
      new Request("http://localhost/api/v1/catalog/health-check", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token && { authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify(body),
      });
    try {
      expect((await healthCheck(request())).status).toBe(401);
      expect((await healthCheck(request("wrong"))).status).toBe(401);
      expect(
        (await healthCheck(request("local-vitest-cron-token", { targetProductId: "bad" }))).status,
      ).toBe(400);
      const responses = await Promise.all(
        Array.from({ length: 3 }, () => healthCheck(request("local-vitest-cron-token"))),
      );
      expect(responses.map((r) => r.status).sort()).toEqual([200, 200, 429]);
      expect(await responses.find((r) => r.ok)?.json()).toMatchObject({
        success: true,
        data: { checkedCount: 0 },
      });
    } finally {
      await prisma.affiliateLinkHealthQuota.deleteMany();
    }
  });
});
