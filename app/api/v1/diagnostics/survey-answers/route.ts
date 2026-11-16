import { handleUpload } from "@/lib/diagnostic/upload-handler";
import { surveySubmissionSchema } from "@/lib/diagnostic/baumannScoring";
import { saveSurvey } from "@/lib/diagnostic/survey-session";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return handleUpload(request, surveySubmissionSchema, "INVALID_SURVEY_PAYLOAD", 201, saveSurvey, {
    invalidMessage: "바우만 문진 12문항에 대한 모든 답변(1~4)이 올바르게 제출되어야 합니다.",
    sessionCode: "MISSING_SESSION_IDENTITY",
    failureCode: "SURVEY_UNAVAILABLE",
    failureMessage: "설문 응답을 저장하지 못했습니다. 다시 시도해 주세요.",
  });
}
