import { privateHeaders } from "@/lib/auth/response";
import { getDiagnosticReport } from "@/lib/diagnostic/report-store";
import { reportFailure, requireReportIdentity } from "@/lib/diagnostic/report-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ reportId: string }> },
) {
  try {
    const owner = await requireReportIdentity();
    const { reportId } = await params;
    return Response.json(
      { success: true, data: await getDiagnosticReport(owner, reportId) },
      { headers: privateHeaders },
    );
  } catch (error) {
    return reportFailure(error);
  }
}
