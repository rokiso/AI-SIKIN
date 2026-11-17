import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { AuthError, privateHeaders } from "@/lib/auth/response";
import { readSessionCookies, resolveRequestIdentity } from "@/lib/session/identity";
import { historyQuerySchema } from "@/lib/mypage/types";
import { getMyHistory } from "@/lib/mypage/history";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const identity = await resolveRequestIdentity(readSessionCookies(await cookies()));
    if (identity.kind === "anonymous")
      throw new AuthError(401, "SESSION_REQUIRED", "페이지를 새로고침해 주세요.");
    const params = new URL(request.url).searchParams;
    if (
      [...params.keys()].some(
        (key) => !["tab", "limit", "cursor"].includes(key) || params.getAll(key).length !== 1,
      )
    )
      throw new AuthError(400, "INVALID_HISTORY_QUERY", "이력 조회 요청을 확인해 주세요.");
    const parsed = historyQuerySchema.safeParse(Object.fromEntries(params));
    if (!parsed.success)
      throw new AuthError(400, "INVALID_HISTORY_QUERY", "이력 조회 요청을 확인해 주세요.");
    return NextResponse.json(
      { success: true, data: await getMyHistory(identity, parsed.data) },
      { headers: privateHeaders },
    );
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof AuthError)
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.status, headers: privateHeaders },
      );
    console.error("[mypage-history] History query failed");
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "MYPAGE_HISTORY_FETCH_FAILED",
          message: "마이페이지 이력 정보를 불러오는 중 서버 오류가 발생했습니다.",
        },
      },
      { status: 503, headers: privateHeaders },
    );
  }
}
