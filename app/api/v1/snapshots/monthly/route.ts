import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { AuthError, privateHeaders } from "@/lib/auth/response";
import { requireSnapshotMember } from "@/lib/snapshot/http";
import { monthlyQuerySchema } from "@/lib/snapshot/calendar";
import { getMonthlySnapshots } from "@/lib/snapshot/monthly";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Bounded per-process member limit. Never treat a caller-supplied IP header as a verified identity.
const requests = new Map<string, { start: number; count: number }>();
export async function GET(request: Request) {
  try {
    let userId: string;
    try {
      userId = await requireSnapshotMember();
    } catch (error) {
      if (error instanceof AuthError && error.status === 401)
        throw new AuthError(401, "UNAUTHORIZED", "로그인이 필요한 서비스입니다.");
      throw error;
    }
    const params = new URL(request.url).searchParams;
    if (
      [...params.keys()].some((key) => !["year", "month"].includes(key)) ||
      params.getAll("year").length !== 1 ||
      params.getAll("month").length !== 1
    )
      throw new AuthError(
        400,
        "INVALID_MONTHLY_QUERY",
        "연도(4자리 숫자)와 월(1~12) 파라미터가 올바르지 않습니다.",
      );
    const parsed = monthlyQuerySchema.safeParse(Object.fromEntries(params));
    if (!parsed.success)
      throw new AuthError(
        400,
        "INVALID_MONTHLY_QUERY",
        "연도(4자리 숫자)와 월(1~12) 파라미터가 올바르지 않습니다.",
      );
    const now = Date.now();
    for (const [key, entry] of requests) if (now - entry.start >= 60_000) requests.delete(key);
    const entry = requests.get(userId) ?? { start: now, count: 0 };
    if (entry.count >= 60)
      throw new AuthError(
        429,
        "RATE_LIMIT_EXCEEDED",
        "요청이 많습니다. 잠시 후 다시 시도해 주세요.",
      );
    if (!requests.has(userId) && requests.size >= 10000)
      throw new AuthError(503, "MONTHLY_UNAVAILABLE", "잠시 후 다시 시도해 주세요.");
    entry.count++;
    requests.set(userId, entry);
    return NextResponse.json(
      {
        success: true,
        data: await getMonthlySnapshots(userId, parsed.data.year, parsed.data.month),
      },
      { headers: privateHeaders },
    );
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof AuthError)
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        {
          status: error.status,
          headers: { ...privateHeaders, ...(error.status === 429 ? { "Retry-After": "60" } : {}) },
        },
      );
    console.error("[snapshot-monthly] History query failed");
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "MONTHLY_UNAVAILABLE",
          message: "스냅샷 기록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.",
        },
      },
      { status: 503, headers: privateHeaders },
    );
  }
}
