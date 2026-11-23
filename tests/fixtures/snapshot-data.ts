import "dotenv/config";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { getDatabaseUrl } from "@/lib/server-env";
import { assertLocalDevelopmentDatabase } from "@/lib/database-development";
import { getKstRecordDate } from "@/lib/dashboard/date";
import { evaluateSnapshotMilestone } from "@/lib/snapshot/milestone-issuance";
const [action, path, payloadPath] = process.argv.slice(2);
if (!path || !path.startsWith("/tmp/sikin-snapshot-test-")) throw new Error("Invalid fixture path");
assertLocalDevelopmentDatabase(getDatabaseUrl());
const db = getPrisma();
try {
  if (action === "initialize") {
    const user = await db.user.create({ data: { nickname: "스냅샷 테스트 회원" } });
    const token = randomBytes(32).toString("hex");
    await db.authSession.create({
      data: { userId: user.id, sessionToken: token, expiresAt: new Date(Date.now() + 3600000) },
    });
    await writeFile(path, JSON.stringify({ userId: user.id }), { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify({ token }));
  } else {
    const state = z.object({ userId: z.string() }).parse(JSON.parse(await readFile(path, "utf8")));
    if (action === "prepare-milestone") {
      const days = Number(
        z.enum(["1", "2", "3", "7", "3-general"]).parse(payloadPath).split("-")[0],
      );
      const today = getKstRecordDate();
      await db.$transaction(async (tx) => {
        for (let offset = days - 1; offset > 0; offset--) {
          const date = new Date(today.getTime() - offset * 86400000);
          await tx.dailySnapshot.create({
            data: {
              userId: state.userId,
              s3Key: `daily-snapshots/snp-${randomUUID()}.jpg`,
              recordDate: date,
              feedbackSource: payloadPath?.endsWith("-general") ? "GENERAL_GUIDANCE" : "AI",
              feedbackComment: "로컬 모의 사진 참고 분류",
              hydrationLevel: "LOW",
              soothingLevel: "BALANCED",
              sebumLevel: "HIGH",
            },
          });
          await evaluateSnapshotMilestone(tx, state.userId, date);
        }
      });
      console.log(JSON.stringify({ prepared: true }));
    } else if ((action === "record" || action === "record-milestone") && payloadPath) {
      const payload = z
        .object({ s3Key: z.string(), etag: z.string(), idempotencyKey: z.string() })
        .parse(JSON.parse(await readFile(payloadPath, "utf8")));
      const { row, milestone } = await db.$transaction(async (tx) => {
        const row = await tx.dailySnapshot.upsert({
          where: {
            uq_user_daily_snapshot: { userId: state.userId, recordDate: getKstRecordDate() },
          },
          create: {
            userId: state.userId,
            recordDate: getKstRecordDate(),
            ...payload,
            feedbackSource: action === "record-milestone" ? "AI" : "GENERAL_GUIDANCE",
            feedbackComment:
              "AI 분석이 연결되지 않아 피부 상태를 판정하지 않았습니다. 보습과 자외선 차단을 챙겨주세요.",
          },
          update: {},
        });
        const milestone =
          action === "record-milestone"
            ? await evaluateSnapshotMilestone(tx, state.userId, row.recordDate)
            : null;
        return { row, milestone };
      });
      console.log(
        JSON.stringify({
          id: row.id,
          recordDate: row.recordDate.toISOString().slice(0, 10),
          createdAt: row.createdAt.toISOString(),
          feedbackComment: row.feedbackComment,
          milestone,
        }),
      );
    } else if (action === "cleanup") {
      await db.user.delete({ where: { id: state.userId } });
      await unlink(path);
      console.log(JSON.stringify({ cleaned: true }));
    } else throw new Error("Invalid fixture action");
  }
} finally {
  await db.$disconnect();
}
