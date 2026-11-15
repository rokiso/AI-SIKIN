import "server-only";
import { cookies } from "next/headers";
import { readSessionCookies, resolveRequestIdentity } from "@/lib/session/identity";
import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { AuthError, privateHeaders, smallJson } from "@/lib/auth/response";
import type { z } from "zod";
export async function requireSnapshotMember() {
  const identity = await resolveRequestIdentity(readSessionCookies(await cookies()));
  if (identity.kind !== "member")
    throw new AuthError(401, "SESSION_REQUIRED", "일일 피부 기록은 로그인이 필요한 서비스입니다.");
  return identity.userId;
}
export async function snapshotInput<T>(request: Request, schema: z.ZodType<T>) {
  const body: unknown = await smallJson(request);
  if (typeof body === "object" && body !== null && "userId" in body)
    throw new AuthError(403, "FORBIDDEN_SNAPSHOT", "사용자 식별자를 지정할 수 없습니다.");
  const result = schema.safeParse(body);
  if (!result.success)
    throw new AuthError(
      400,
      "INVALID_SNAPSHOT_DATA",
      "유효하지 않은 스냅샷 요청이거나 파일 검증에 실패했습니다.",
    );
  return result.data;
}

export function snapshotFailure(error: unknown) {
  unstable_rethrow(error);
  if (error instanceof AuthError)
    return NextResponse.json(
      { success: false, error: { code: error.code, message: error.message } },
      { status: error.status, headers: privateHeaders },
    );
  console.error("[snapshot] Recording request failed");
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "SNAPSHOT_UNAVAILABLE",
        message: "기록을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.",
      },
    },
    { status: 503, headers: privateHeaders },
  );
}
