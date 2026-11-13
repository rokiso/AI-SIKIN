import { z } from "zod";
import { uploadCompleteSchema } from "@/lib/diagnostic/upload-validation";
import type { ProcessedImageResult } from "@/lib/image/clientPreprocess";
export interface OnUploadCompletePayload {
  uploadSessionId: string;
  s3Key: string;
  previewUrl: string;
}
export type UploadPhase = "link" | "transfer" | "confirm";
export class ImageUploadError extends Error {
  constructor(
    public phase: UploadPhase,
    message: string,
  ) {
    super(message);
  }
}
const keySchema = z.string().regex(/^raw-faces\/[0-9a-f-]{36}\.(jpeg|png|webp)$/);
const issuedSchema = z.object({
  success: z.literal(true),
  data: z.object({
    uploadSessionId: z.uuid(),
    uploadUrl: z.url(),
    s3Key: keySchema,
    expiresInSeconds: z.number().positive(),
  }),
});
const confirmedSchema = z.object({
  success: z.literal(true),
  data: z.object({
    uploadSessionId: z.uuid(),
    status: z.literal("UPLOADED"),
    s3Key: keySchema,
    confirmedAt: z.iso.datetime(),
  }),
});
const failureSchema = z.object({
  success: z.literal(false),
  error: z.object({ code: z.string() }),
});
const messages = {
  link: "업로드 링크를 준비하지 못했습니다. 잠시 후 다시 시도해주세요.",
  transfer: "사진 전송 중 네트워크 연결이 끊어졌습니다.",
  confirm: "사진 업로드 검증에 실패했습니다. 사진을 다시 선택해주세요.",
};
export function normalizeETag(value: string | null) {
  if (!value)
    throw new ImageUploadError(
      "confirm",
      "전송 결과를 확인할 수 없습니다. 사진을 다시 선택해주세요.",
    );
  const etag = value.startsWith('"') ? value : `"${value}"`;
  const parsed = uploadCompleteSchema.shape.etag.safeParse(etag);
  if (!parsed.success) throw new ImageUploadError("confirm", messages.confirm);
  return parsed.data;
}
async function post(path: string, body: unknown, signal: AbortSignal, phase: "link" | "confirm") {
  try {
    const response = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
    });
    const result: unknown = await response.json();
    if (
      response.status === 429 &&
      failureSchema.safeParse(result).data?.error.code === "RATE_LIMIT_EXCEEDED"
    )
      throw new ImageUploadError(
        phase,
        "진단 이미지 업로드 요청 한도를 초과했습니다. 1시간 후 다시 시도해주세요.",
      );
    if (!response.ok) throw new ImageUploadError(phase, messages[phase]);
    return result;
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    if (error instanceof ImageUploadError) throw error;
    throw new ImageUploadError(phase, messages[phase]);
  }
}
function putImage(
  url: string,
  image: ProcessedImageResult,
  signal: AbortSignal,
  progress: (value: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const cleanup = () => signal.removeEventListener("abort", abort);
    const fail = () => {
      cleanup();
      reject(new ImageUploadError("transfer", messages.transfer));
    };
    const abort = () => {
      xhr.abort();
      cleanup();
      reject(signal.reason);
    };
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const target = new URL(url);
    if (
      target.username ||
      target.password ||
      (target.protocol !== "https:" &&
        !(
          process.env.NODE_ENV !== "production" &&
          target.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)
        ))
    ) {
      reject(new ImageUploadError("link", messages.link));
      return;
    }
    xhr.open("PUT", url);
    xhr.timeout = 30000;
    xhr.withCredentials = false;
    xhr.setRequestHeader("Content-Type", image.mimeType);
    xhr.setRequestHeader("x-amz-server-side-encryption", "AES256");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) progress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onerror = fail;
    xhr.ontimeout = fail;
    xhr.onabort = fail;
    xhr.onload = () => {
      cleanup();
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new ImageUploadError("transfer", messages.transfer));
        return;
      }
      try {
        resolve(normalizeETag(xhr.getResponseHeader("ETag")));
      } catch (error) {
        reject(error);
      }
    };
    signal.addEventListener("abort", abort, { once: true });
    xhr.send(image.blob);
  });
}
export async function uploadDiagnosticImage(
  image: ProcessedImageResult,
  signal: AbortSignal,
  report: (phase: UploadPhase, progress?: number) => void,
): Promise<OnUploadCompletePayload> {
  report("link");
  const issued = issuedSchema.safeParse(
    await post(
      "/api/v1/diagnostics/upload-url",
      { mimeType: image.mimeType, fileSizeBytes: image.fileSizeBytes },
      signal,
      "link",
    ),
  );
  if (!issued.success) throw new ImageUploadError("link", messages.link);
  const { uploadSessionId, s3Key, uploadUrl } = issued.data.data;
  report("transfer", 0);
  const etag = await putImage(uploadUrl, image, signal, (value) => report("transfer", value));
  signal.throwIfAborted();
  report("confirm");
  const confirmed = confirmedSchema.safeParse(
    await post("/api/v1/diagnostics/upload-complete", { uploadSessionId, etag }, signal, "confirm"),
  );
  if (
    !confirmed.success ||
    confirmed.data.data.uploadSessionId !== uploadSessionId ||
    confirmed.data.data.s3Key !== s3Key
  )
    throw new ImageUploadError("confirm", messages.confirm);
  return { uploadSessionId, s3Key, previewUrl: image.previewUrl };
}
