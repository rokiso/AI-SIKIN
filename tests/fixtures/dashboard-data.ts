import "dotenv/config";
import { randomBytes } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { getPrisma } from "../../lib/prisma";
import { getDatabaseUrl } from "../../lib/server-env";
import { assertLocalDevelopmentDatabase } from "../../lib/database-development";
import { createGuestSession } from "../../lib/session/guest-proof";

const action = process.argv[2];
const statePath = resolve(process.argv[3] ?? "");
if (!/^\/tmp\/sikin-dashboard-fixture-[a-f0-9-]+\.json$/.test(statePath)) throw new Error("Invalid local fixture state path");
assertLocalDevelopmentDatabase(getDatabaseUrl());
const prisma = getPrisma();
const fixtureState = z.object({ userIds: z.array(z.string().uuid()), diagnosticIds: z.array(z.string().uuid()) });

function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

async function initialize() {
  const userIds: string[] = [];
  const diagnosticIds: string[] = [];
  try {
    const member = await prisma.user.create({ data: { nickname: "대시보드 검증 회원" } });
    const stranger = await prisma.user.create({ data: { nickname: "별도 소유권 검증 회원" } });
    userIds.push(member.id, stranger.id);
    const token = randomBytes(32).toString("hex");
    const expiredToken = randomBytes(32).toString("hex");
    const revokedToken = randomBytes(32).toString("hex");
    await prisma.authSession.create({ data: { userId: member.id, sessionToken: token, expiresAt: new Date(Date.now() + 86_400_000) } });
    await prisma.authSession.create({ data: { userId: member.id, sessionToken: expiredToken, expiresAt: new Date(Date.now() - 60_000) } });
    const revoked = await prisma.authSession.create({ data: { userId: member.id, sessionToken: revokedToken, expiresAt: new Date(Date.now() + 86_400_000) } });
    await prisma.authSession.delete({ where: { id: revoked.id } });
    const guest = createGuestSession();

    async function diagnostic(data: { userId?: string; guestDeviceId?: string; baumannType: string; summaryText: string; recommendedIngredients: string[]; createdAt: Date }) {
      const session = await prisma.diagnosticSession.create({
        data: {
          userId: data.userId,
          guestDeviceId: data.guestDeviceId,
          status: "COMPLETED",
          surveyAnswers: { fixture: true },
          axisScores: { oiliness: 60, sensitivity: 70, pigmentation: 30, elasticity: 40 },
          createdAt: data.createdAt,
          report: { create: { baumannType: data.baumannType, oilinessScore: 60, sensitivityScore: 70, pigmentationScore: 30, elasticityScore: 40, summaryText: data.summaryText, recommendedIngredients: data.recommendedIngredients, cautionIngredients: ["검증용 주의 성분"], aiAuditMetadata: { fixture: true } } },
        },
        include: { report: true },
      });
      diagnosticIds.push(session.id);
      return session.report?.id;
    }

    const memberReportId = await diagnostic({ userId: member.id, baumannType: "OSNW", summaryText: "회원 소유 피부 관리 요약입니다.", recommendedIngredients: ["판테놀", "세라마이드"], createdAt: new Date(Date.now() - 3_600_000) });
    const guestReportId = await diagnostic({ guestDeviceId: guest.guestDeviceId, baumannType: "DSPT", summaryText: "서명 게스트 소유 피부 관리 요약입니다.", recommendedIngredients: ["병풀추출물"], createdAt: new Date(Date.now() - 1_800_000) });
    const strangerReportId = await diagnostic({ userId: stranger.id, guestDeviceId: guest.guestDeviceId, baumannType: "ORNT", summaryText: "다른 사용자에게 귀속된 비공개 요약입니다.", recommendedIngredients: ["접근 차단 검증 성분"], createdAt: new Date() });
    await writeFile(statePath, JSON.stringify({ userIds, diagnosticIds }), { flag: "wx", mode: 0o600 });
    return { memberId: member.id, strangerId: stranger.id, token, expiredToken, revokedToken, guestId: guest.guestDeviceId, guestProof: guest.proof, memberReportId, guestReportId, strangerReportId, recordDate: today() };
  } catch (error) {
    if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    if (diagnosticIds.length) await prisma.diagnosticSession.deleteMany({ where: { id: { in: diagnosticIds } } });
    throw error;
  }
}

async function readState() {
  return fixtureState.parse(JSON.parse(await readFile(statePath, "utf8")) as unknown);
}

let result: unknown;
try {
  if (action === "initialize") result = await initialize();
  else if (action === "record") {
    const state = await readState();
    const userId = state.userIds[0];
    if (!userId) throw new Error("Fixture member is missing");
    const recordDate = today();
    await prisma.dailySnapshot.upsert({
      where: { uq_user_daily_snapshot: { userId, recordDate: new Date(`${recordDate}T00:00:00.000Z`) } },
      create: { userId, recordDate: new Date(`${recordDate}T00:00:00.000Z`), s3Key: "test-only-dashboard-snapshot", feedbackComment: "오늘의 검증용 피부 피드백입니다.", hydrationLevel: "BALANCED", soothingLevel: "HIGH", sebumLevel: "LOW" },
      update: {},
    });
    result = { recorded: true, recordDate };
  } else if (action === "cleanup") {
    const state = await readState();
    await prisma.user.deleteMany({ where: { id: { in: state.userIds } } });
    await prisma.diagnosticSession.deleteMany({ where: { id: { in: state.diagnosticIds } } });
    await unlink(statePath);
    result = { cleaned: true };
  } else throw new Error("Unknown local fixture command");
} finally {
  await prisma.$disconnect();
}

// Only the parent test process captures this output. Never log it to reports.
process.stdout.write(JSON.stringify(result));
