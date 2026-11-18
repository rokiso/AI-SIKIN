import "server-only";
import { unstable_rethrow } from "next/navigation";
import { AuthError, privateHeaders } from "@/lib/auth/response";
import { UploadError } from "@/lib/diagnostic/upload-session";
export function consentFailure(error: unknown) {
  unstable_rethrow(error);
  if (error instanceof AuthError || error instanceof UploadError)
    return Response.json(
      { success: false, error: { code: error.code, message: error.message } },
      { status: error.status, headers: privateHeaders },
    );
  console.error("[consent] Consent operation unavailable");
  return Response.json(
    {
      success: false,
      error: {
        code: "CONSENT_UNAVAILABLE",
        message: "동의 처리 중 오류가 발생했습니다. 다시 시도해 주세요.",
      },
    },
    { status: 503, headers: privateHeaders },
  );
}
