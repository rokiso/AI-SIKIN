// @vitest-environment node
import { randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "../../generated/prisma/client";
import { assertLocalDevelopmentDatabase } from "../../lib/database-development";
import { getDatabaseUrl } from "../../lib/server-env";
import { getPrisma } from "../../lib/prisma";
import { getDashboardSummary } from "../../lib/dashboard/summary";
import { getKstRecordDate } from "../../lib/dashboard/date";
import { createGuestSession } from "../../lib/session/guest-proof";

let prisma: PrismaClient;
const userIds = new Set<string>();
const diagnosticSessionIds = new Set<string>();

beforeAll(async () => {
  assertLocalDevelopmentDatabase(getDatabaseUrl());
  prisma = getPrisma();
  await prisma.$queryRaw`SELECT 1`;
});

afterEach(async () => {
  if (diagnosticSessionIds.size)
    await prisma.diagnosticSession.deleteMany({ where: { id: { in: [...diagnosticSessionIds] } } });
  if (userIds.size) await prisma.user.deleteMany({ where: { id: { in: [...userIds] } } });
  diagnosticSessionIds.clear();
  userIds.clear();
});

afterAll(async () => {
  if (prisma) await prisma.$disconnect();
});

async function createMember(now = new Date(), expiresAt = new Date(now.getTime() + 86_400_000)) {
  const user = await prisma.user.create({ data: { nickname: "대시보드 검증 사용자" } });
  userIds.add(user.id);
  const sessionToken = randomBytes(32).toString("hex");
  await prisma.authSession.create({ data: { userId: user.id, sessionToken, expiresAt } });
  return { user, sessionToken };
}

interface DiagnosticFixture {
  userId?: string;
  guestDeviceId?: string;
  createdAt?: Date;
  status?: "COMPLETED" | "ANALYSIS_PENDING" | "FAILED";
  withReport?: boolean;
  summary?: string;
}

async function createDiagnostic(options: DiagnosticFixture) {
  const diagnostic = await prisma.diagnosticSession.create({
    data: {
      userId: options.userId,
      guestDeviceId: options.guestDeviceId,
      status: options.status ?? "COMPLETED",
      surveyAnswers: { test: true },
      axisScores: { oiliness: 25, sensitivity: 50, pigmentation: 75, elasticity: 100 },
      createdAt: options.createdAt,
      ...(options.withReport === false
        ? {}
        : {
            report: {
              create: {
                baumannType: "OSNW",
                oilinessScore: 25,
                sensitivityScore: 50,
                pigmentationScore: 75,
                elasticityScore: 100,
                summaryText: options.summary ?? "본인 피부 기록 요약",
                recommendedIngredients: ["검증용 권장 성분"],
                cautionIngredients: ["검증용 주의 성분"],
                aiAuditMetadata: { model: "private-audit-model", promptHash: "private-audit-hash" },
              },
            },
          }),
    },
    include: { report: true },
  });
  diagnosticSessionIds.add(diagnostic.id);
  return diagnostic;
}

describe("authorized dashboard read projection", () => {
  it("returns the anonymous empty state even while unrelated records exist", async () => {
    const member = await createMember();
    await createDiagnostic({ userId: member.user.id });
    const summary = await getDashboardSummary({});
    expect(summary.hasDiagnosticHistory).toBe(false);
    expect(summary.user).toEqual({ isAuthenticated: false, nickname: null });
    expect(summary.latestDiagnostic).toBeNull();
    expect(summary.todaySnapshot).toMatchObject({
      isRecorded: false,
      snapshotId: null,
      feedbackComment: null,
      conditions: null,
    });
  });

  it("returns only a proven guest's latest completed unclaimed diagnostic", async () => {
    const now = new Date();
    const guest = createGuestSession(now);
    const outsider = createGuestSession(now);
    const member = await createMember(now);
    await createDiagnostic({
      guestDeviceId: guest.guestDeviceId,
      createdAt: new Date(now.getTime() - 5_000),
    });
    const latest = await createDiagnostic({
      guestDeviceId: guest.guestDeviceId,
      createdAt: new Date(now.getTime() - 4_000),
      summary: "게스트 본인의 최신 완료 기록",
    });
    await createDiagnostic({
      guestDeviceId: outsider.guestDeviceId,
      createdAt: now,
      summary: "다른 게스트의 기록",
    });
    await createDiagnostic({
      guestDeviceId: guest.guestDeviceId,
      userId: member.user.id,
      createdAt: now,
      summary: "회원에게 귀속된 기록",
    });
    await createDiagnostic({
      guestDeviceId: guest.guestDeviceId,
      createdAt: now,
      status: "ANALYSIS_PENDING",
      summary: "완료되지 않은 기록",
    });
    await createDiagnostic({
      guestDeviceId: guest.guestDeviceId,
      createdAt: now,
      withReport: false,
    });

    const summary = await getDashboardSummary(
      { guestId: guest.guestDeviceId, guestProof: guest.proof },
      now,
    );
    expect(summary.hasDiagnosticHistory).toBe(true);
    expect(summary.latestDiagnostic).toMatchObject({
      reportId: latest.report?.id,
      baumannType: "OSNW",
      baumannNameKo: "지성 민감 비색소성 주름 피부",
      summary: "게스트 본인의 최신 완료 기록",
      recommendedIngredients: ["검증용 권장 성분"],
      cautionIngredients: ["검증용 주의 성분"],
      axisScores: { oiliness: 25, sensitivity: 50, pigmentation: 75, elasticity: 100 },
    });
    expect(summary.user.isAuthenticated).toBe(false);
    expect(summary.todaySnapshot.isRecorded).toBe(false);
    const serialized = JSON.stringify(summary);
    for (const privateValue of [
      member.user.id,
      guest.guestDeviceId,
      "private-audit-model",
      "private-audit-hash",
    ])
      expect(serialized).not.toContain(privateValue);
  });

  it("does not treat unsigned, mismatched, tampered or expired guest cookies as ownership", async () => {
    const now = new Date();
    const victim = createGuestSession(now);
    const other = createGuestSession(now);
    await createDiagnostic({ guestDeviceId: victim.guestDeviceId });
    const attempts = [
      { guestId: victim.guestDeviceId },
      { guestId: victim.guestDeviceId, guestProof: other.proof },
      { guestId: other.guestDeviceId, guestProof: victim.proof },
      { guestId: victim.guestDeviceId, guestProof: `${victim.proof.slice(0, -1)}!` },
    ];
    for (const values of attempts)
      expect((await getDashboardSummary(values, now)).latestDiagnostic).toBeNull();
    const expired = await getDashboardSummary(
      { guestId: victim.guestDeviceId, guestProof: victim.proof },
      new Date(now.getTime() + 31 * 86_400_000),
    );
    expect(expired.latestDiagnostic).toBeNull();
  });

  it("selects the verified member's records and never falls back to a supplied guest's records", async () => {
    const now = new Date();
    const own = await createMember(now);
    const other = await createMember(now);
    const guest = createGuestSession(now);
    const ownDiagnostic = await createDiagnostic({
      userId: own.user.id,
      createdAt: new Date(now.getTime() - 2_000),
    });
    await createDiagnostic({ userId: other.user.id, createdAt: now, summary: "타인 회원의 기록" });
    await createDiagnostic({
      guestDeviceId: guest.guestDeviceId,
      createdAt: now,
      summary: "독립 게스트 기록",
    });
    const values = {
      sessionToken: own.sessionToken,
      guestId: guest.guestDeviceId,
      guestProof: guest.proof,
      userId: other.user.id,
    };
    const summary = await getDashboardSummary(values, now);
    expect(summary.user).toEqual({ isAuthenticated: true, nickname: own.user.nickname });
    expect(summary.latestDiagnostic?.reportId).toBe(ownDiagnostic.report?.id);
    expect(JSON.stringify(summary)).not.toContain(other.user.id);
    expect(JSON.stringify(summary)).not.toContain(own.sessionToken);
  });

  it("does not grant member data from expired, revoked or malformed session credentials", async () => {
    const now = new Date();
    const expired = await createMember(now, new Date(now.getTime() - 1));
    const revoked = await createMember(now);
    await createDiagnostic({ userId: expired.user.id });
    await createDiagnostic({ userId: revoked.user.id });
    await prisma.authSession.delete({ where: { sessionToken: revoked.sessionToken } });
    for (const sessionToken of [
      expired.sessionToken,
      revoked.sessionToken,
      "invalid",
      randomBytes(32).toString("hex"),
    ]) {
      const summary = await getDashboardSummary({ sessionToken }, now);
      expect(summary.user.isAuthenticated).toBe(false);
      expect(summary.latestDiagnostic).toBeNull();
    }
  });

  it("queries the KST calendar day rather than the host's UTC day", async () => {
    const now = new Date("2026-11-09T15:00:00.000Z");
    const member = await createMember(now);
    const previous = await prisma.dailySnapshot.create({
      data: {
        userId: member.user.id,
        s3Key: "previous-private-image",
        recordDate: new Date("2026-11-09T00:00:00.000Z"),
        feedbackComment: "이전 날짜의 코멘트",
      },
    });
    const today = await prisma.dailySnapshot.create({
      data: {
        userId: member.user.id,
        s3Key: "today-private-image",
        recordDate: new Date("2026-11-10T00:00:00.000Z"),
        feedbackComment: "한국 날짜 기준 오늘의 기록",
        hydrationLevel: "HIGH",
        soothingLevel: "BALANCED",
        sebumLevel: "LOW",
      },
    });
    const summary = await getDashboardSummary({ sessionToken: member.sessionToken }, now);
    expect(summary.hasDiagnosticHistory).toBe(false);
    expect(summary.todaySnapshot).toEqual({
      isRecorded: true,
      snapshotId: today.id,
      recordDate: "2026-11-10",
      feedbackComment: "한국 날짜 기준 오늘의 기록",
      conditions: { hydrationLevel: "HIGH", soothingLevel: "BALANCED", sebumLevel: "LOW" },
    });
    expect(summary.todaySnapshot.snapshotId).not.toBe(previous.id);
    expect(JSON.stringify(summary)).not.toContain("today-private-image");
  });

  it("returns a newly created snapshot on the next read rather than caching a prior user result", async () => {
    const now = new Date();
    const member = await createMember(now);
    expect(
      (await getDashboardSummary({ sessionToken: member.sessionToken }, now)).todaySnapshot
        .isRecorded,
    ).toBe(false);
    const snapshot = await prisma.dailySnapshot.create({
      data: {
        userId: member.user.id,
        s3Key: "new-private-image",
        recordDate: getKstRecordDate(now),
        feedbackComment: "새 기록 반영 확인",
      },
    });
    const updated = await getDashboardSummary({ sessionToken: member.sessionToken }, now);
    expect(updated.todaySnapshot).toMatchObject({
      isRecorded: true,
      snapshotId: snapshot.id,
      feedbackComment: "새 기록 반영 확인",
    });
  });
});
