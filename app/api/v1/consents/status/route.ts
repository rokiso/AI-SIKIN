import { privateHeaders } from "@/lib/auth/response";
import { requireReportIdentity } from "@/lib/diagnostic/report-http";
import { UploadError } from "@/lib/diagnostic/upload-session";
import { getConsentStatus } from "@/lib/consent/service";
import { consentFailure } from "@/lib/consent/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    if (new URL(request.url).search)
      throw new UploadError(400, "INVALID_CONSENT_QUERY", "본인의 동의 상태만 확인할 수 있습니다.");
    const owner = await requireReportIdentity();
    return Response.json(
      { success: true, data: await getConsentStatus(owner) },
      { headers: privateHeaders },
    );
  } catch (error) {
    return consentFailure(error);
  }
}
