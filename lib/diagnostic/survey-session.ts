import "server-only";
import { randomUUID } from "node:crypto";
import { getPrisma } from "@/lib/prisma";
import { UploadError, type UploadOwner } from "./upload-session";
import {
  scoreBaumannAnswers,
  surveySubmissionSchema,
  surveyAnswersSchema,
  type SurveySubmission,
} from "./baumannScoring";

export async function saveSurvey(owner: UploadOwner, input: SurveySubmission) {
  const data = surveySubmissionSchema.parse(input);
  const answers = [...data.answers].sort((a, b) => a.questionId.localeCompare(b.questionId));
  const result = scoreBaumannAnswers(answers);
  const ownerWhere =
    owner.kind === "member"
      ? { userId: owner.userId }
      : { userId: null, guestDeviceId: owner.guestDeviceId };
  return getPrisma().$transaction(async (tx) => {
    const key = `survey:${owner.kind === "member" ? owner.userId : owner.guestDeviceId}`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
    if (data.requestId) {
      const existing = await tx.diagnosticSession.findFirst({
        where: { id: data.requestId, ...ownerWhere },
      });
      if (existing) {
        const saved = surveyAnswersSchema.parse(existing.surveyAnswers);
        if (
          answers.some(
            (answer) =>
              !saved.some(
                (item) =>
                  item.questionId === answer.questionId &&
                  item.selectedChoice === answer.selectedChoice,
              ),
          ) ||
          existing.uploadSessionId !== (data.uploadSessionId ?? null)
        )
          throw new UploadError(
            409,
            "SURVEY_ALREADY_SAVED",
            "저장된 응답은 바꿀 수 없습니다. 새 문진을 시작해 주세요.",
          );
        return {
          sessionId: existing.id,
          status: existing.status,
          ...result,
          createdAt: existing.createdAt.toISOString(),
        };
      }
      if (
        await tx.diagnosticSession.findUnique({
          where: { id: data.requestId },
          select: { id: true },
        })
      )
        throw new UploadError(409, "SURVEY_REQUEST_CONFLICT", "새 문진을 시작해 주세요.");
    }
    const count = await tx.diagnosticSession.count({
      where: { ...ownerWhere, createdAt: { gt: new Date(Date.now() - 60_000) } },
    });
    if (count >= 30)
      throw new UploadError(
        429,
        "RATE_LIMIT_EXCEEDED",
        "문진 저장 요청이 많습니다. 잠시 후 다시 시도해 주세요.",
      );
    if (data.uploadSessionId) {
      const upload = await tx.imageUploadSession.findFirst({
        where: { id: data.uploadSessionId, ...ownerWhere, status: "UPLOADED" },
        select: { id: true },
      });
      if (!upload)
        throw new UploadError(
          403,
          "INVALID_SURVEY_UPLOAD",
          "본인이 등록을 완료한 사진을 선택해 주세요.",
        );
    }
    const row = await tx.diagnosticSession.create({
      data: {
        id: data.requestId ?? randomUUID(),
        ...ownerWhere,
        uploadSessionId: data.uploadSessionId ?? null,
        surveyAnswers: answers,
        axisScores: result.axisScores,
        status: "SURVEY_COMPLETED",
      },
    });
    return {
      sessionId: row.id,
      status: row.status,
      ...result,
      createdAt: row.createdAt.toISOString(),
    };
  });
}
