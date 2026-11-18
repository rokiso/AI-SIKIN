import { AuthError, privateHeaders, requireSameOrigin, smallJson } from "@/lib/auth/response";
import { analyzeSession } from "@/lib/diagnostic/analyze-session";
import { analyzeInputSchema } from "@/lib/diagnostic/report-types";
import { reportFailure, requireReportIdentity } from "@/lib/diagnostic/report-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const owner = await requireReportIdentity();
    const input = analyzeInputSchema.safeParse(await smallJson(request));
    if (!input.success)
      throw new AuthError(400, "INVALID_ANALYSIS_REQUEST", "문진 세션 식별자를 확인해 주세요.");
    const data = await analyzeSession(owner, input.data);
    return Response.json(
      { success: true, data },
      { status: data.status === "ANALYSIS_PENDING" ? 202 : 200, headers: privateHeaders },
    );
  } catch (error) {
    return reportFailure(error);
  }
}
