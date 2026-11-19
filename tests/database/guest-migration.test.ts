import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { getPrisma } from "@/lib/prisma";
import { getDatabaseUrl } from "@/lib/server-env";
import { assertLocalDevelopmentDatabase } from "@/lib/database-development";
import { migrateGuestDataToUser } from "@/lib/auth/migrationService";
const db = getPrisma();
const users: string[] = [],
  guests: string[] = [];
beforeAll(() => assertLocalDevelopmentDatabase(getDatabaseUrl()));
afterEach(async () => {
  await db.diagnosticSession.deleteMany({ where: { guestDeviceId: { in: guests } } });
  await db.imageUploadSession.deleteMany({ where: { guestDeviceId: { in: guests } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  users.length = guests.length = 0;
});
afterAll(() => db.$disconnect());
async function fixture() {
  const guest = randomUUID();
  guests.push(guest);
  const target = await db.user.create({ data: { nickname: "이관 대상" } });
  const other = await db.user.create({ data: { nickname: "다른 소유자" } });
  users.push(target.id, other.id);
  const diagnostic = await db.diagnosticSession.create({
    data: {
      guestDeviceId: guest,
      surveyAnswers: {},
      axisScores: {},
      status: "COMPLETED",
      report: {
        create: {
          baumannType: "DSNT",
          oilinessScore: 20,
          sensitivityScore: 60,
          pigmentationScore: 20,
          elasticityScore: 20,
          summaryText: "이관 검증",
          recommendedIngredients: [],
          cautionIngredients: [],
          aiAuditMetadata: {},
        },
      },
    },
    include: { report: true },
  });
  const image = await db.imageUploadSession.create({
    data: {
      guestDeviceId: guest,
      s3Key: `raw-faces/${randomUUID()}.jpeg`,
      mimeType: "image/jpeg",
      fileSizeBytes: 1024,
      expiresAt: new Date(Date.now() + 60000),
    },
  });
  const owned = await db.diagnosticSession.create({
    data: {
      guestDeviceId: guest,
      userId: other.id,
      surveyAnswers: {},
      axisScores: {},
      status: "SURVEY_COMPLETED",
    },
  });
  return { guest, target, other, diagnostic, image, owned };
}
describe("atomic guest migration service", () => {
  it("transfers both session tables, preserves report data, and is idempotent", async () => {
    const f = await fixture();
    const params = { guestDeviceId: f.guest, targetUserId: f.target.id };
    expect(await db.$transaction((tx) => migrateGuestDataToUser(tx, params))).toEqual({
      migratedDiagnosticSessions: 1,
      migratedImageSessions: 1,
    });
    expect(await db.$transaction((tx) => migrateGuestDataToUser(tx, params))).toEqual({
      migratedDiagnosticSessions: 0,
      migratedImageSessions: 0,
    });
    expect(
      (
        await db.diagnosticSession.findUniqueOrThrow({
          where: { id: f.diagnostic.id },
          include: { report: true },
        })
      ).report,
    ).toEqual(f.diagnostic.report);
    expect(
      (await db.imageUploadSession.findUniqueOrThrow({ where: { id: f.image.id } })).userId,
    ).toBe(f.target.id);
    expect(
      (await db.diagnosticSession.findUniqueOrThrow({ where: { id: f.owned.id } })).userId,
    ).toBe(f.other.id);
  });
  it("serializes competing accounts so both tables converge on one owner", async () => {
    const f = await fixture();
    const results = await Promise.all(
      [f.target.id, f.other.id].map((targetUserId) =>
        db.$transaction((tx) =>
          migrateGuestDataToUser(tx, { guestDeviceId: f.guest, targetUserId }),
        ),
      ),
    );
    expect(results.map((r) => r.migratedDiagnosticSessions).sort()).toEqual([0, 1]);
    expect(results.map((r) => r.migratedImageSessions).sort()).toEqual([0, 1]);
    const row = await db.diagnosticSession.findUniqueOrThrow({ where: { id: f.diagnostic.id } });
    expect(
      (await db.imageUploadSession.findUniqueOrThrow({ where: { id: f.image.id } })).userId,
    ).toBe(row.userId);
  });
  it("rolls back both transfers when a later operation in the login transaction fails", async () => {
    const f = await fixture();
    const abort = new Error("Deliberate rollback");
    await expect(
      db.$transaction(async (tx) => {
        await migrateGuestDataToUser(tx, { guestDeviceId: f.guest, targetUserId: f.target.id });
        throw abort;
      }),
    ).rejects.toBe(abort);
    expect(
      (await db.diagnosticSession.findUniqueOrThrow({ where: { id: f.diagnostic.id } })).userId,
    ).toBeNull();
    expect(
      (await db.imageUploadSession.findUniqueOrThrow({ where: { id: f.image.id } })).userId,
    ).toBeNull();
  });
});
