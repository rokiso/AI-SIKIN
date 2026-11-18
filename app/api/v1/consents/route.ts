import { handleUpload } from "@/lib/diagnostic/upload-handler";
import { consentSubmissionSchema } from "@/lib/consent/types";
import { recordConsent } from "@/lib/consent/service";
import { consentRequestMetadata } from "@/lib/server/getClientIp";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return handleUpload(
    request,
    consentSubmissionSchema,
    "CONSENT_REQUIRED",
    201,
    (owner, input) => recordConsent(owner, input, consentRequestMetadata(request.headers)),
    {
      invalidMessage: "사진 기능 이용을 위한 필수 민감정보 수집·이용 동의를 확인해 주세요.",
      sessionCode: "MISSING_SESSION_IDENTITY",
      failureCode: "CONSENT_UNAVAILABLE",
      failureMessage: "동의 처리 중 오류가 발생했습니다. 다시 시도해 주세요.",
    },
  );
}
