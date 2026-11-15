import "dotenv/config";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { getDatabaseUrl } from "@/lib/server-env";
import { assertLocalDevelopmentDatabase } from "@/lib/database-development";
import { getKstRecordDate } from "@/lib/dashboard/date";
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
    if (action === "record" && payloadPath) {
      const payload = z
        .object({ s3Key: z.string(), etag: z.string(), idempotencyKey: z.string() })
        .parse(JSON.parse(await readFile(payloadPath, "utf8")));
      const row = await db.dailySnapshot.upsert({
        where: { uq_user_daily_snapshot: { userId: state.userId, recordDate: getKstRecordDate() } },
        create: {
          userId: state.userId,
          recordDate: getKstRecordDate(),
          ...payload,
          feedbackSource: "GENERAL_GUIDANCE",
          feedbackComment:
            "AI 분석이 연결되지 않아 피부 상태를 판정하지 않았습니다. 보습과 자외선 차단을 챙겨주세요.",
        },
        update: {},
      });
      console.log(
        JSON.stringify({
          id: row.id,
          recordDate: row.recordDate.toISOString().slice(0, 10),
          createdAt: row.createdAt.toISOString(),
          feedbackComment: row.feedbackComment,
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
