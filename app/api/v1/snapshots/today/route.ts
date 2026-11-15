import { NextResponse } from "next/server";
import { AuthError, privateHeaders } from "@/lib/auth/response";
import { snapshotFailure, requireSnapshotMember } from "@/lib/snapshot/http";
import { getTodaySnapshot } from "@/lib/snapshot/service";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const user = await requireSnapshotMember();
    if (new URL(request.url).searchParams.has("userId"))
      throw new AuthError(403, "FORBIDDEN_SNAPSHOT", "다른 사용자의 기록을 조회할 수 없습니다.");
    if (new URL(request.url).search)
      throw new AuthError(400, "INVALID_SNAPSHOT_DATA", "조회 요청을 확인해 주세요.");
    return NextResponse.json(
      { success: true, data: await getTodaySnapshot(user) },
      { headers: privateHeaders },
    );
  } catch (error) {
    return snapshotFailure(error);
  }
}
