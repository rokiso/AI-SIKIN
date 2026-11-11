// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "../../generated/prisma/client";
import { getPrisma } from "../../lib/prisma";
import { getDatabaseUrl } from "../../lib/server-env";
import { assertLocalDevelopmentDatabase } from "../../lib/database-development";
import { SAMPLE_PROCEDURE_IDS, SAMPLE_PRODUCT_IDS, seedSampleCatalog } from "../../prisma/seed";

let prisma: PrismaClient;
const userIds = new Set<string>();

beforeAll(async () => {
  assertLocalDevelopmentDatabase(getDatabaseUrl());
  prisma = getPrisma();
  await prisma.$queryRaw`SELECT 1`;
});

afterEach(async () => {
  // Only remove rows created by this test run. Never reset or truncate a database.
  if (userIds.size) await prisma.user.deleteMany({ where: { id: { in: [...userIds] } } });
  userIds.clear();
});

afterAll(async () => {
  if (prisma) await prisma.$disconnect();
});

async function createUser() {
  const user = await prisma.user.create({ data: { nickname: "DB 통합 검증용 사용자" } });
  userIds.add(user.id);
  return user;
}

async function createSession(userId: string) {
  return prisma.diagnosticSession.create({
    data: { userId, surveyAnswers: { answers: [1, 2, 3] }, axisScores: { oiliness: 50, sensitivity: 50, pigmentation: 50, elasticity: 50 } },
  });
}

function reportData(sessionId: string, baumannType = "OSNW") {
  return { sessionId, baumannType, oilinessScore: 50, sensitivityScore: 50, pigmentationScore: 50, elasticityScore: 50, summaryText: "통합 검증용 리포트", aiAuditMetadata: { model: "test-only" } };
}

describe("initial PostgreSQL migration", () => {
  it("stores the dashboard's recommended and caution ingredients on the immutable report", async () => {
    const user = await createUser();
    const session = await createSession(user.id);
    const report = await prisma.diagnosticReport.create({
      data: { ...reportData(session.id), recommendedIngredients: ["검증용 권장 성분"], cautionIngredients: ["검증용 주의 성분"] },
    });
    const stored = await prisma.diagnosticReport.findUniqueOrThrow({ where: { id: report.id } });
    expect(stored.recommendedIngredients).toEqual(["검증용 권장 성분"]);
    expect(stored.cautionIngredients).toEqual(["검증용 주의 성분"]);
    await expect(prisma.diagnosticReport.update({ where: { id: report.id }, data: { recommendedIngredients: ["다른 성분"] } })).rejects.toThrow();
  });
  it("creates all twelve mapped tables, foreign keys and indexes", async () => {
    const tables = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
    `;
    expect(tables.map((table) => table.table_name)).toEqual(expect.arrayContaining([
      "users", "user_accounts", "auth_sessions", "user_consent_histories", "image_upload_sessions", "diagnostic_sessions", "diagnostic_reports", "products", "product_recommendations", "medical_procedures", "procedure_guide_mappings", "daily_snapshots",
    ]));
    const indexes = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
    `;
    expect(indexes.map((index) => index.indexname)).toEqual(expect.arrayContaining([
      "diagnostic_sessions_upload_session_id_idx", "image_upload_sessions_user_id_idx", "user_accounts_user_id_idx", "products_category_is_active_idx",
    ]));
    const foreignKeys = await prisma.$queryRaw<{ conname: string }[]>`
      SELECT conname FROM pg_constraint WHERE contype = 'f' AND connamespace = 'public'::regnamespace
    `;
    expect(foreignKeys.map((key) => key.conname)).toEqual(expect.arrayContaining([
      "image_upload_sessions_user_id_fkey", "diagnostic_sessions_upload_session_id_fkey", "diagnostic_reports_session_id_fkey",
    ]));
  });

  it("rejects orphan ownership references and duplicate OAuth provider accounts", async () => {
    const user = await createUser();
    const providerAccountId = randomUUID();
    await prisma.userAccount.create({ data: { userId: user.id, provider: "GOOGLE", providerAccountId } });
    await expect(prisma.userAccount.create({ data: { userId: user.id, provider: "GOOGLE", providerAccountId } })).rejects.toMatchObject({ code: "P2002" });
    await expect(prisma.userAccount.create({ data: { userId: randomUUID(), provider: "GOOGLE", providerAccountId: randomUUID() } })).rejects.toMatchObject({ code: "P2003" });
    await expect(prisma.imageUploadSession.create({ data: { userId: randomUUID(), s3Key: randomUUID(), mimeType: "image/jpeg", fileSizeBytes: 128, expiresAt: new Date(Date.now() + 300_000) } })).rejects.toMatchObject({ code: "P2003" });
  });

  it("enforces one report per diagnostic session and one daily snapshot per date", async () => {
    const user = await createUser();
    const session = await createSession(user.id);
    await prisma.diagnosticReport.create({ data: reportData(session.id) });
    await expect(prisma.diagnosticReport.create({ data: reportData(session.id) })).rejects.toMatchObject({ code: "P2002" });
    const snapshot = { userId: user.id, s3Key: randomUUID(), recordDate: new Date("2026-11-10T00:00:00.000Z"), feedbackComment: "검증용 기록" };
    await prisma.dailySnapshot.create({ data: snapshot });
    await expect(prisma.dailySnapshot.create({ data: { ...snapshot, s3Key: randomUUID() } })).rejects.toMatchObject({ code: "P2002" });
  });

  it("accepts all sixteen Baumann codes and rejects an unknown code or invalid axis score", async () => {
    const user = await createUser();
    for (const oiliness of ["O", "D"]) for (const sensitivity of ["S", "R"]) for (const pigmentation of ["P", "N"]) for (const elasticity of ["W", "T"]) {
      const session = await createSession(user.id);
      const code = `${oiliness}${sensitivity}${pigmentation}${elasticity}`;
      expect((await prisma.diagnosticReport.create({ data: reportData(session.id, code) })).baumannType).toBe(code);
    }
    const unknown = await createSession(user.id);
    await expect(prisma.diagnosticReport.create({ data: reportData(unknown.id, "UNKNOWN") })).rejects.toThrow(/constraint/i);
    const invalidScore = await createSession(user.id);
    await expect(prisma.diagnosticReport.create({ data: { ...reportData(invalidScore.id), oilinessScore: 101 } })).rejects.toThrow(/constraint/i);
    await expect(prisma.diagnosticReport.create({ data: { ...reportData(invalidScore.id), sensitivityScore: -1 } })).rejects.toThrow(/constraint/i);
  });

  it("keeps reports and original survey answers immutable while session status remains mutable", async () => {
    const user = await createUser();
    const session = await createSession(user.id);
    const report = await prisma.diagnosticReport.create({ data: reportData(session.id) });
    await expect(prisma.$executeRaw`UPDATE diagnostic_reports SET summary_text = 'changed' WHERE id = ${report.id}`).rejects.toThrow(/immutable/i);
    await expect(prisma.$executeRaw`UPDATE diagnostic_sessions SET survey_answers = '{}'::jsonb WHERE id = ${session.id}`).rejects.toThrow(/immutable/i);
    expect((await prisma.diagnosticSession.update({ where: { id: session.id }, data: { status: "ANALYSIS_PENDING" } })).status).toBe("ANALYSIS_PENDING");
    expect((await prisma.diagnosticReport.findUniqueOrThrow({ where: { id: report.id } })).summaryText).toBe("통합 검증용 리포트");
  });

  it("validates file sizes, product type tags and procedure price ranges", async () => {
    const user = await createUser();
    await expect(prisma.imageUploadSession.create({ data: { userId: user.id, s3Key: randomUUID(), mimeType: "image/jpeg", fileSizeBytes: 0, expiresAt: new Date(Date.now() + 300_000) } })).rejects.toThrow(/constraint/i);
    await expect(prisma.product.create({ data: { brand: "test", name: "invalid", category: "TONER", ingredients: [], targetTypes: ["UNKNOWN"], affiliateUrl: "https://example.invalid", isActive: false } })).rejects.toThrow(/constraint/i);
    await expect(prisma.medicalProcedure.create({ data: { nameKo: "검증용", principleText: "검증용", recommendedInterval: "검증용", sideEffects: [], minPriceKrw: 200, maxPriceKrw: 100, isActive: false } })).rejects.toThrow(/constraint/i);
  });

  it("cascades owned records on user deletion without blocking hard-delete", async () => {
    const user = await createUser();
    const upload = await prisma.imageUploadSession.create({ data: { userId: user.id, s3Key: randomUUID(), mimeType: "image/jpeg", fileSizeBytes: 128, expiresAt: new Date(Date.now() + 300_000) } });
    const session = await prisma.diagnosticSession.create({ data: { userId: user.id, uploadSessionId: upload.id, surveyAnswers: {}, axisScores: {} } });
    const report = await prisma.diagnosticReport.create({ data: reportData(session.id) });
    await prisma.authSession.create({ data: { userId: user.id, sessionToken: randomUUID(), expiresAt: new Date(Date.now() + 300_000) } });
    await prisma.userConsentHistory.create({ data: { userId: user.id, sensitiveAgreed: true, termsVersion: "integration-test" } });
    await prisma.user.delete({ where: { id: user.id } });
    userIds.delete(user.id);
    expect(await prisma.imageUploadSession.findUnique({ where: { id: upload.id } })).toBeNull();
    expect(await prisma.diagnosticSession.findUnique({ where: { id: session.id } })).toBeNull();
    expect(await prisma.diagnosticReport.findUnique({ where: { id: report.id } })).toBeNull();
    expect(await prisma.authSession.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.userConsentHistory.count({ where: { userId: user.id } })).toBe(0);
  });

  it("seeds ten inactive procedure and four category fixtures idempotently", async () => {
    await seedSampleCatalog(prisma);
    await seedSampleCatalog(prisma);
    const products = await prisma.product.findMany({ where: { id: { in: SAMPLE_PRODUCT_IDS } } });
    const procedures = await prisma.medicalProcedure.findMany({ where: { id: { in: SAMPLE_PROCEDURE_IDS } } });
    expect(products).toHaveLength(4);
    expect(procedures).toHaveLength(10);
    expect(products.map((product) => product.category).sort()).toEqual(["CREAM", "SERUM", "SUNCARE", "TONER"]);
    for (const product of products) {
      expect(product.isActive).toBe(false);
      expect(new URL(product.affiliateUrl).hostname).toBe("example.invalid");
    }
    for (const procedure of procedures) {
      expect(procedure.isActive).toBe(false);
      expect(procedure.minPriceKrw).toBe(0);
      expect(procedure.maxPriceKrw).toBe(0);
      expect(procedure.nameKo).toContain("[개발 샘플]");
    }
  });
});
