import "server-only";
import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import type { z } from "zod";
import { readSessionCookies, resolveRequestIdentity } from "@/lib/session/identity";
import { UploadError, type UploadOwner } from "./upload-session";

const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
const invalidMessage =
  "지원하지 않는 이미지 형식이거나 파일 크기가 허용 범위(10KB~10MB)를 벗어났습니다.";
function failure(status: number, code: string, message: string) {
  return Response.json({ success: false, error: { code, message } }, { status, headers });
}
export async function handleUpload<T>(
  request: Request,
  schema: z.ZodType<T>,
  code: string,
  status: number,
  action: (owner: UploadOwner, data: T) => Promise<unknown>,
) {
  try {
    if (
      request.headers.get("sec-fetch-site") === "cross-site" ||
      (request.headers.get("origin") &&
        request.headers.get("origin") !== new URL(request.url).origin)
    ) {
      return failure(403, "FORBIDDEN_REQUEST", "같은 사이트에서 다시 요청해 주세요.");
    }
    if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
      return failure(
        400,
        code,
        code === "INVALID_FILE_SPEC" ? invalidMessage : "업로드 완료 요청을 확인해 주세요.",
      );
    }
    const identity = await resolveRequestIdentity(readSessionCookies(await cookies()));
    if (identity.kind === "anonymous")
      return failure(
        401,
        "SESSION_REQUIRED",
        "페이지를 새로고침하여 세션을 시작한 뒤 다시 시도해 주세요.",
      );
    // Bound the body even when Content-Length is omitted or forged.
    const reader = request.body?.getReader();
    if (!reader) return failure(400, code, "요청 내용을 확인해 주세요.");
    let text = "";
    let bytes = 0;
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 4096) {
          await reader.cancel();
          return failure(400, code, "요청 내용이 너무 큽니다.");
        }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
    } finally {
      reader.releaseLock();
    }
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return failure(400, code, "요청 내용을 확인해 주세요.");
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      return failure(
        400,
        code,
        code === "INVALID_FILE_SPEC" ? invalidMessage : "업로드 완료 요청을 확인해 주세요.",
      );
    return Response.json(
      { success: true, data: await action(identity, parsed.data) },
      { status, headers },
    );
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof UploadError) return failure(error.status, error.code, error.message);
    console.error("[diagnostic-upload] Upload operation failed");
    return failure(
      503,
      "UPLOAD_UNAVAILABLE",
      "사진 업로드를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    );
  }
}
