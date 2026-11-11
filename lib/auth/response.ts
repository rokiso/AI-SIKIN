import "server-only";
import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
export class AuthError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export const privateHeaders = { "Cache-Control": "private, no-store", Vary: "Cookie" };
export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};
export function authFailure(error: unknown) {
  unstable_rethrow(error);
  if (error instanceof AuthError)
    return NextResponse.json(
      { success: false, error: { code: error.code, message: error.message } },
      { status: error.status, headers: privateHeaders },
    );
  console.error("[auth] Authentication operation failed");
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "AUTH_UNAVAILABLE",
        message: "지금은 로그인을 처리할 수 없습니다. 잠시 후 다시 시도해 주세요.",
      },
    },
    { status: 503, headers: privateHeaders },
  );
}
export function requireSameOrigin(request: Request) {
  if (
    request.headers.get("sec-fetch-site") === "cross-site" ||
    request.headers.get("origin") !== new URL(request.url).origin
  )
    throw new AuthError(403, "FORBIDDEN_REQUEST", "같은 사이트에서 다시 요청해 주세요.");
}
export async function smallJson(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json")
    throw new AuthError(400, "INVALID_AUTH_REQUEST", "요청 내용을 확인해 주세요.");
  const reader = request.body?.getReader();
  if (!reader) throw new AuthError(400, "INVALID_AUTH_REQUEST", "요청 내용을 확인해 주세요.");
  let text = "";
  let size = 0;
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) {
        await reader.cancel();
        throw new AuthError(400, "INVALID_AUTH_REQUEST", "요청 내용이 너무 큽니다.");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    try {
      return JSON.parse(text);
    } catch {
      throw new AuthError(400, "INVALID_AUTH_REQUEST", "요청 내용을 확인해 주세요.");
    }
  } finally {
    reader.releaseLock();
  }
}
