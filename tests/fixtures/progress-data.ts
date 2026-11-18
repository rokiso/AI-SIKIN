import "dotenv/config";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import { getPrisma } from "../../lib/prisma";
import { getDatabaseUrl } from "../../lib/server-env";
import { assertLocalDevelopmentDatabase } from "../../lib/database-development";
import { publishProgress } from "../../lib/diagnostic/progressEmitter";
import { baumannQuestions } from "../../lib/diagnostic/baumannData";
import { ruleBasedEvaluator } from "../../lib/diagnostic/ruleBasedEvaluator";
const [action, statePath, id, stage] = process.argv.slice(2);
if (!/^\/tmp\/sikin-dashboard-fixture-[a-f0-9-]+\.json$/.test(statePath))
  throw new Error("Invalid local fixture path");
assertLocalDevelopmentDatabase(getDatabaseUrl());
const state = z
  .object({ userIds: z.array(z.uuid()), diagnosticIds: z.array(z.uuid()) })
  .parse(JSON.parse(await readFile(statePath, "utf8")));
const db = getPrisma();
let result: unknown;
try {
  if (action === "create") {
    const guestDeviceId = z.uuid().parse(id);
    const session = await db.diagnosticSession.create({
      data: {
        id: randomUUID(),
        guestDeviceId,
        surveyAnswers: baumannQuestions.map((q) => ({ questionId: q.id, selectedChoice: 2 })),
        axisScores: {},
      },
    });
    state.diagnosticIds.push(session.id);
    await writeFile(statePath, JSON.stringify(state), { mode: 0o600 });
    result = { sessionId: session.id };
  } else {
    const sessionId = z.uuid().parse(id);
    if (!state.diagnosticIds.includes(sessionId)) throw new Error("Not a fixture-owned session");
    if (action === "notify") {
      const step = z.coerce.number().int().min(1).max(3).parse(stage);
      const steps = ["EXTRACTING_FEATURES", "COMBINING_SURVEY", "GENERATING_REPORT"] as const;
      const valid = await publishProgress(sessionId, {
        step: steps[step - 1],
        stepNumber: step === 1 ? 1 : step === 2 ? 2 : 3,
        progressPercent: [35, 70, 95][step - 1],
        message: [
          "사진 AI 미적용 · 문진 응답을 확인해요.",
          "저장된 문진 응답으로 피부 특성을 정리했어요.",
          "리포트와 성분 안내를 저장하고 있어요.",
        ][step - 1],
        skipped: step === 1,
      });
      if (!valid) throw new Error("Fixture event delivery failed");
      result = { published: true };
    } else if (action === "complete") {
      const data = ruleBasedEvaluator({
        oiliness: 33,
        sensitivity: 33,
        pigmentation: 33,
        elasticity: 33,
      });
      const report = await db.$transaction(async (tx) => {
        await tx.diagnosticSession.update({
          where: { id: sessionId },
          data: { status: "COMPLETED" },
        });
        return tx.diagnosticReport.create({
          data: {
            sessionId,
            baumannType: data.baumannType,
            oilinessScore: 33,
            sensitivityScore: 33,
            pigmentationScore: 33,
            elasticityScore: 33,
            summaryText: data.summary,
            recommendedIngredients: data.recommendedIngredients,
            cautionIngredients: data.cautionIngredients,
            aiAuditMetadata: {
              source: "QUESTIONNAIRE",
              isFallback: true,
              reason: stage === "timeout" ? "AI_GATEWAY_TIMEOUT" : "AI_DISABLED",
            },
          },
        });
      });
      result = { reportId: report.id };
    } else throw new Error("Unknown fixture action");
  }
} finally {
  await db.$disconnect();
}
process.stdout.write(JSON.stringify(result));
