import { privateHeaders } from "@/lib/auth/response";
import { UploadError } from "@/lib/diagnostic/upload-session";
import { getLatestConsentTerms } from "@/lib/consent/service";
import { consentFailure } from "@/lib/consent/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    if (
      query.getAll("type").length > 1 ||
      [...query.keys()].some((key) => key !== "type") ||
      (query.has("type") && query.get("type") !== "BIOMETRIC_FACE_DATA")
    )
      throw new UploadError(400, "INVALID_CONSENT_TYPE", "동의 약관 종류를 확인해 주세요.");
    return Response.json(
      { success: true, data: await getLatestConsentTerms() },
      { headers: privateHeaders },
    );
  } catch (error) {
    return consentFailure(error);
  }
}
