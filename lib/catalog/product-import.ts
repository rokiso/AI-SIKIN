import "server-only";
import { isIP } from "node:net";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { getDatabaseUrl, getAffiliatePartnerConfiguration } from "@/lib/server-env";
import { assertLocalDevelopmentDatabase } from "@/lib/database-development";
import { categories } from "./types";
import { safeAffiliateUrl } from "./affiliate-url";
import { assertIngredientCopy, parseFullIngredients } from "./ingredient-rules";
import { checkAffiliateSetup } from "./affiliate-setup";
const label = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((v) => !/[\x00-\x1f\x7f]/.test(v));
const sourceUrl = z.url().refine((value) => {
  if (!URL.canParse(value)) return false;
  const u = new URL(value);
  return (
    u.protocol === "https:" &&
    !u.username &&
    !u.password &&
    !u.port &&
    !u.hash &&
    !isIP(u.hostname) &&
    /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(u.hostname) &&
    !/\.(invalid|local|localhost)$/i.test(u.hostname)
  );
});
const manifestSchema = z
  .object({
    version: z.literal(1),
    products: z
      .array(
        z
          .object({
            id: z.uuid(),
            brandName: label,
            productName: label,
            category: z.enum(["TONER", "AMPOULE", "CREAM", "SUNSCREEN"]),
            tier: z.enum(["PRIMARY", "SECONDARY"]),
            suitableBaumannTypes: z
              .array(z.string().regex(/^[OD][SR][PN][WT]$/))
              .min(1)
              .max(16),
            fullIngredients: z.string().trim().min(1).max(20000),
            keyIngredients: z.array(label).min(1).max(30),
            affiliateBaseUrl: z.url().max(8192),
            affiliatePlatform: z.string().regex(/^[A-Z][A-Z0-9_]{2,63}$/),
            thumbnailUrl: z
              .string()
              .regex(/^\/catalog-assets\/[a-zA-Z0-9/_-]+\.webp$/)
              .nullable()
              .default(null),
            review: z
              .object({
                sourceUrl,
                checkedAt: z.iso.datetime(),
                contentReviewed: z.literal(true),
                imageRightsConfirmed: z.literal(true),
              })
              .strict(),
          })
          .strict(),
      )
      .max(128),
  })
  .strict();
export class ProductManifestError extends Error {
  constructor(public readonly code: string) {
    super(
      "Product manifest failed validation; check its structure, sources, copy and approved links.",
    );
    this.name = "ProductManifestError";
  }
}
export function inspectProductManifest(input: unknown) {
  const parsed = manifestSchema.safeParse(input);
  if (!parsed.success) throw new ProductManifestError("INVALID_PRODUCT_MANIFEST");
  const products = parsed.data.products;
  try {
    const ids = new Set<string>(),
      urls = new Set<string>();
    for (const p of products) {
      const url = safeAffiliateUrl(p.affiliateBaseUrl).href;
      if (ids.has(p.id) || urls.has(url) || Date.parse(p.review.checkedAt) > Date.now())
        throw Error("Duplicate or future review");
      ids.add(p.id);
      urls.add(url);
      for (const text of [p.brandName, p.productName, p.fullIngredients, ...p.keyIngredients])
        assertIngredientCopy(text);
      if (parseFullIngredients(p.fullIngredients).length < 2) throw Error("Incomplete ingredients");
    }
  } catch {
    throw new ProductManifestError("INVALID_PRODUCT_CONTENT");
  }
  const coverage = categories.map((c) => ({
    category: c.category,
    primary: products.filter((p) => p.category === c.category && p.tier === "PRIMARY").length,
    secondary: products.filter((p) => p.category === c.category && p.tier === "SECONDARY").length,
  }));
  const configuration = checkAffiliateSetup();
  let platformMatches = false;
  if (configuration.configurationValid) {
    const { platform } = getAffiliatePartnerConfiguration();
    platformMatches = products.every((p) => p.affiliatePlatform === platform);
  }
  return {
    products,
    summary: {
      productCount: products.length,
      coverage,
      configuration,
      readyForLocalImport:
        configuration.configurationValid &&
        platformMatches &&
        products.length >= 8 &&
        coverage.every((c) => c.primary >= 1 && c.secondary >= 1),
      sourceReview: "OPERATOR_DECLARED_NOT_INDEPENDENTLY_VERIFIED",
      liveActivation: "NOT_CHANGED",
    },
  };
}
export async function importInactiveAffiliateProducts(db: PrismaClient, input: unknown) {
  assertLocalDevelopmentDatabase(getDatabaseUrl());
  const inspected = inspectProductManifest(input);
  if (!inspected.summary.readyForLocalImport)
    throw new ProductManifestError("PRODUCT_SETUP_INCOMPLETE");
  const rows = inspected.products.map((p) => ({
    id: p.id,
    brandName: p.brandName,
    productName: p.productName,
    category: categories.find((c) => c.category === p.category)!.dbCategory,
    ingredients: parseFullIngredients(p.fullIngredients),
    fullIngredients: p.fullIngredients,
    keyIngredients: p.keyIngredients,
    suitableBaumannTypes: p.suitableBaumannTypes,
    isPrimary: p.tier === "PRIMARY",
    affiliateBaseUrl: p.affiliateBaseUrl,
    thumbnailUrl: p.thumbnailUrl,
  }));
  return db.$transaction(async (tx) => {
    // Serialize competing imports, including from separate local processes.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('catalog:affiliate-import',0))::text`;
    const existing = await tx.product.findMany({ where: { id: { in: rows.map((p) => p.id) } } });
    for (const row of rows) {
      const old = existing.find((p) => p.id === row.id);
      if (
        old &&
        Object.entries(row).some(
          ([key, value]) => JSON.stringify(old[key as keyof typeof old]) !== JSON.stringify(value),
        )
      )
        throw new ProductManifestError("EXISTING_PRODUCT_CONFLICT");
    }
    const additions = rows.filter((p) => !existing.some((old) => old.id === p.id));
    if (additions.length)
      await tx.product.createMany({
        data: additions.map((p) => ({ ...p, isActive: false, status: "UNAVAILABLE" })),
      });
    return {
      createdInactive: additions.length,
      preservedExisting: existing.length,
      liveActivation: "NOT_CHANGED",
    };
  });
}
