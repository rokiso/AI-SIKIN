import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { AuthError, privateHeaders } from "@/lib/auth/response";
import { readSessionCookies, resolveRequestIdentity } from "@/lib/session/identity";
export async function catalogIdentity() {
  return resolveRequestIdentity(readSessionCookies(await cookies()));
}
export function parseCatalogQuery<T>(request: Request, schema: z.ZodType<T>, code: string): T {
  const params = new URL(request.url).searchParams;
  if (params.size > 4 || [...params.keys()].some((key) => params.getAll(key).length !== 1))
    throw new AuthError(400, code, "요청한 상품과 리포트를 다시 확인해 주세요.");
  const result = schema.safeParse(Object.fromEntries(params));
  if (!result.success)
    throw new AuthError(400, code, "유효한 상품과 진단 리포트 식별자가 필요합니다.");
  return result.data;
}
export function catalogFailure(error: unknown) {
  unstable_rethrow(error);
  if (error instanceof AuthError)
    return NextResponse.json(
      { success: false, error: { code: error.code, message: error.message } },
      { status: error.status, headers: privateHeaders },
    );
  console.error("[catalog] Recommendation lookup failed");
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "CATALOG_UNAVAILABLE",
        message: "추천 상품을 불러오는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
      },
    },
    { status: 503, headers: privateHeaders },
  );
}
