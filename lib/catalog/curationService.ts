import "server-only";
import { randomUUID } from "node:crypto";
import type { Product, ProductRecommendation, Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import type { VerifiedIdentity } from "@/lib/session/identity-types";
import { AuthError } from "@/lib/auth/response";
import { cosmeticDisclaimer, type ProductRecommendationResponse, type ProductView } from "./types";
import { matchProducts, recommendationReason, safeIngredientLabels } from "./matching";
import { isAffiliateUrlAllowed, trackedAffiliateUrl } from "./affiliate-url";
import { getIngredientRules } from "./ingredient-repository";

let cached: { products: Product[]; expires: number } | null = null;
let loading: Promise<Product[]> | null = null;
let revision = 0;
const recommendationLoads = new Map<string, Promise<ProductRecommendationResponse>>();
export function invalidateProductCache() {
  cached = null;
  loading = null;
  revision++;
}
async function catalogProducts(): Promise<Product[]> {
  if (cached && cached.expires > Date.now()) return cached.products;
  if (loading) return loading;
  const started = revision;
  const pending = getPrisma()
    .product.findMany({ where: { isActive: true }, take: 2048, orderBy: { id: "asc" } })
    .then((products) => {
      if (revision === started) cached = { products, expires: Date.now() + 30_000 };
      return products;
    });
  loading = pending;
  try {
    return await pending;
  } finally {
    if (loading === pending) loading = null;
  }
}
export async function authorizedReport(reportId: string, identity: VerifiedIdentity) {
  if (identity.kind === "anonymous")
    throw new AuthError(404, "REPORT_NOT_FOUND", "본인의 진단 리포트를 먼저 열어 주세요.");
  const report = await getPrisma().diagnosticReport.findFirst({
    where: {
      id: reportId,
      session: {
        status: "COMPLETED",
        ...(identity.kind === "member"
          ? { userId: identity.userId }
          : { userId: null, guestDeviceId: identity.guestDeviceId }),
      },
    },
    select: { id: true, baumannType: true, recommendedIngredients: true, cautionIngredients: true },
  });
  if (!report || !/^[OD][SR][PN][WT]$/.test(report.baumannType))
    throw new AuthError(404, "REPORT_NOT_FOUND", "본인의 진단 리포트를 찾을 수 없습니다.");
  return report;
}
function project(
  product: Product,
  reportId: string,
  tier: "PRIMARY" | "SECONDARY",
  reason: string,
): ProductView {
  return {
    id: product.id,
    brandName: product.brandName,
    productName: product.productName,
    thumbnailUrl:
      product.thumbnailUrl && /^\/catalog-assets\/[a-zA-Z0-9/_-]+\.webp$/.test(product.thumbnailUrl)
        ? product.thumbnailUrl
        : null,
    keyIngredients: safeIngredientLabels(product.keyIngredients),
    recommendationReason: reason,
    status: product.isActive ? product.status : "UNAVAILABLE",
    redirectPath:
      product.isActive &&
      product.status === "ACTIVE" &&
      isAffiliateUrlAllowed(product.affiliateBaseUrl)
        ? `/api/v1/catalog/redirect?${new URLSearchParams({ productId: product.id, reportId, tier })}`
        : null,
  };
}
type RecommendationMapping = Pick<
  ProductRecommendation,
  "productId" | "category" | "tier" | "recommendationReason" | "targetIngredients"
>;
function mappingFingerprint(rows: RecommendationMapping[]): string {
  return JSON.stringify(
    rows
      .map((r) => [r.productId, r.category, r.tier, r.recommendationReason, r.targetIngredients])
      .sort(),
  );
}
export async function getProductRecommendations(
  reportId: string,
  identity: VerifiedIdentity,
): Promise<ProductRecommendationResponse> {
  // Authorization is never cached, including after login, revocation or guest transfer.
  const report = await authorizedReport(reportId, identity);
  const key = JSON.stringify([
    report.id,
    report.baumannType,
    report.recommendedIngredients,
    report.cautionIngredients,
    revision,
  ]);
  const loading = recommendationLoads.get(key);
  if (loading) return loading;
  const pending = buildRecommendations(report);
  recommendationLoads.set(key, pending);
  try {
    return await pending;
  } finally {
    if (recommendationLoads.get(key) === pending) recommendationLoads.delete(key);
  }
}
async function buildRecommendations(report: Awaited<ReturnType<typeof authorizedReport>>) {
  const reportId = report.id;
  const [products, rules, existing] = await Promise.all([
    catalogProducts(),
    getIngredientRules(),
    getPrisma().productRecommendation.findMany({ where: { reportId } }),
  ]);
  const matches = matchProducts(products, report, rules);
  const mapped = matches.flatMap((m) =>
    (["PRIMARY", "SECONDARY"] as const).flatMap((tier) => {
      const match = tier === "PRIMARY" ? m.primary : m.secondary;
      return match
        ? [
            {
              reportId,
              productId: match.product.id,
              category: m.dbCategory,
              tier,
              recommendationReason: recommendationReason(match.targets),
              targetIngredients: match.targets,
            },
          ]
        : [];
    }),
  );
  const desired = mappingFingerprint(mapped);
  // A fresh read avoids serializing unchanged warm requests behind a write lock.
  // Neither report authorization nor persisted mapping state is cached.
  if (mappingFingerprint(existing) !== desired) {
    // Recheck after acquiring the lock: another request may have generated them.
    await getPrisma().$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`catalog:${reportId}`}, 0))`;
      const current = await tx.productRecommendation.findMany({ where: { reportId } });
      if (mappingFingerprint(current) === desired) return;
      await tx.productRecommendation.deleteMany({ where: { reportId } });
      if (mapped.length) await tx.productRecommendation.createMany({ data: mapped });
    });
  }
  return {
    reportId,
    baumannType: report.baumannType,
    recommendedIngredients: safeIngredientLabels(report.recommendedIngredients),
    disclaimer: cosmeticDisclaimer,
    categories: matches.map((m) => ({
      category: m.category,
      categoryNameKo: m.categoryNameKo,
      primaryProduct: m.primary
        ? project(m.primary.product, reportId, "PRIMARY", recommendationReason(m.primary.targets))
        : null,
      secondaryProduct: m.secondary
        ? project(
            m.secondary.product,
            reportId,
            "SECONDARY",
            recommendationReason(m.secondary.targets),
          )
        : null,
      isFallbackActive:
        !!m.primary &&
        m.primary.product.status !== "ACTIVE" &&
        m.secondary?.product.status === "ACTIVE",
    })),
  };
}
export async function recordAffiliateRedirect(
  input: { productId: string; reportId?: string; tier: "PRIMARY" | "SECONDARY" },
  identity: VerifiedIdentity,
  userAgent: string | null,
) {
  if (input.reportId) {
    await authorizedReport(input.reportId, identity);
    const existing = await getPrisma().productRecommendation.count({
      where: { reportId: input.reportId },
    });
    if (!existing) await getProductRecommendations(input.reportId, identity);
  }
  return getPrisma().$transaction(async (tx) => {
    if (identity.kind === "member") {
      // Click logs have no user FK. Serialize with account erasure so an
      // already-authorized request cannot recreate the deleted user identifier.
      const user = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM users WHERE id = ${identity.userId} FOR KEY SHARE`;
      if (!user.length) throw new AuthError(401, "UNAUTHORIZED", "다시 로그인해 주세요.");
    }
    let product = await tx.product.findUnique({ where: { id: input.productId } });
    if (!product) throw new AuthError(404, "PRODUCT_NOT_FOUND", "상품을 찾을 수 없습니다.");
    let tier = input.tier;
    let baumannType: string | null = null;
    if (input.reportId) {
      const mapping = await tx.productRecommendation.findUnique({
        where: {
          uq_report_category_tier: { reportId: input.reportId, category: product.category, tier },
        },
      });
      if (mapping?.productId !== product.id)
        throw new AuthError(404, "PRODUCT_NOT_FOUND", "추천 상품을 다시 확인해 주세요.");
      const report = await tx.diagnosticReport.findUnique({
        where: { id: input.reportId },
        select: { baumannType: true },
      });
      baumannType = report?.baumannType ?? null;
    }
    if (!product.isActive || product.status !== "ACTIVE") {
      if (!input.reportId || tier !== "PRIMARY")
        throw new AuthError(404, "PRODUCT_UNAVAILABLE", "다른 추천 상품을 확인해 주세요.");
      const fallback = await tx.productRecommendation.findUnique({
        where: {
          uq_report_category_tier: {
            reportId: input.reportId,
            category: product.category,
            tier: "SECONDARY",
          },
        },
        include: { product: true },
      });
      if (!fallback?.product.isActive || fallback.product.status !== "ACTIVE")
        throw new AuthError(404, "PRODUCT_UNAVAILABLE", "다른 추천 상품을 확인해 주세요.");
      product = fallback.product;
      tier = "SECONDARY";
    }
    const id = randomUUID();
    const targetUrl = trackedAffiliateUrl(product.affiliateBaseUrl, id);
    const data: Prisma.AffiliateClickLogUncheckedCreateInput = {
      id,
      productId: product.id,
      reportId: input.reportId,
      tier,
      targetUrl,
      sourceBaumannType: baumannType,
      userId: identity.kind === "member" ? identity.userId : null,
      guestDeviceId: identity.kind === "guest" ? identity.guestDeviceId : null,
      userAgent: userAgent?.replace(/[\x00-\x1f\x7f]/g, "").slice(0, 512),
    };
    await tx.affiliateClickLog.create({ data });
    return targetUrl;
  });
}

export async function getLatestCatalogReportId(identity: VerifiedIdentity): Promise<string | null> {
  if (identity.kind === "anonymous") return null;
  const report = await getPrisma().diagnosticReport.findFirst({
    where: {
      session: {
        status: "COMPLETED",
        ...(identity.kind === "member"
          ? { userId: identity.userId }
          : { userId: null, guestDeviceId: identity.guestDeviceId }),
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true },
  });
  return report?.id ?? null;
}
