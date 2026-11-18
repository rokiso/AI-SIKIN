import "server-only";
import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { AuthError, privateHeaders } from "@/lib/auth/response";
import { readSessionCookies, resolveRequestIdentity } from "@/lib/session/identity";
export async function requireReportIdentity() {
  const identity = await resolveRequestIdentity(readSessionCookies(await cookies()));
  if (identity.kind === "anonymous")
    throw new AuthError(
      401,
      "SESSION_REQUIRED",
      "세션을 확인할 수 없습니다. 새로고침한 뒤 다시 시도해 주세요.",
    );
  return identity;
}
export function reportFailure(error: unknown) {
  unstable_rethrow(error);
  if (error instanceof AuthError)
    return Response.json(
      { success: false, error: { code: error.code, message: error.message } },
      { status: error.status, headers: privateHeaders },
    );
  console.error("[diagnostic-report] Report operation failed");
  return Response.json(
    {
      success: false,
      error: {
        code: "REPORT_UNAVAILABLE",
        message: "피부 분석을 완료하지 못했습니다. 문진 정보는 보관되어 있으니 다시 시도해 주세요.",
      },
    },
    { status: 503, headers: privateHeaders },
  );
}
