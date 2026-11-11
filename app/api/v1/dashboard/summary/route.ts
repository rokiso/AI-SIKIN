import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { getDashboardSummary } from "@/lib/dashboard/summary";
import { readSessionCookies } from "@/lib/session/identity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const noParametersSchema = z.object({}).strict();
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };

export async function GET(request: Request) {
  const parameters = Object.fromEntries(new URL(request.url).searchParams.entries());
  if (!noParametersSchema.safeParse(parameters).success) {
    return Response.json(
      {
        success: false,
        error: { code: "INVALID_DASHBOARD_REQUEST", message: "대시보드 요청을 확인해 주세요." },
      },
      { status: 400, headers },
    );
  }
  try {
    const values = readSessionCookies(await cookies());
    const data = await getDashboardSummary(values);
    return Response.json({ success: true, data }, { headers });
  } catch (error) {
    unstable_rethrow(error);
    // Driver errors, session credentials and personal records are not log data.
    console.error("[dashboard] Summary read failed");
    return Response.json(
      {
        success: false,
        error: {
          code: "DASHBOARD_FETCH_FAILED",
          message: "대시보드 요약 정보를 조회하는 중 서버 오류가 발생했습니다.",
        },
      },
      { status: 500, headers },
    );
  }
}
