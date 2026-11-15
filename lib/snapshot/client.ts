import { z } from "zod";
import type { ProcessedImageResult } from "@/lib/image/clientPreprocess";
import { putImage } from "@/lib/api/diagnosticUploadClient";
import { normalizeETag } from "@/lib/api/diagnosticUploadClient";
import { snapshotKeySchema, snapshotSchema, todaySnapshotResponse } from "./types";
export class SnapshotClientError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
const messages: Record<string, string> = {
  FACE_NOT_DETECTED: "얼굴이 잘 인식되지 않았습니다. 밝은 곳에서 정면 사진을 다시 선택해주세요.",
  SESSION_REQUIRED: "로그인이 만료되었어요. 마이페이지에서 다시 로그인해주세요.",
  ALREADY_RECORDED_TODAY: "오늘의 피부 스냅샷이 이미 기록되었습니다.",
  SNAPSHOT_UPLOAD_LIMIT: "업로드 요청이 많습니다. 1시간 후 다시 시도해주세요.",
  SNAPSHOT_UPLOAD_EXPIRED: "사진 등록 시간이 지났습니다. 사진을 다시 선택해주세요.",
  INVALID_SNAPSHOT_DATA: "사진을 확인하지 못했습니다. 다른 사진을 선택해주세요.",
  FORBIDDEN_SNAPSHOT: "이 사진을 기록할 권한이 없습니다. 사진을 다시 선택해주세요.",
};
const errorSchema = z.object({ error: z.object({ code: z.string() }) });
export async function snapshotRequest(path: string, signal: AbortSignal, body?: unknown) {
  try {
    const response = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      cache: "no-store",
      credentials: "same-origin",
      ...(body === undefined
        ? {}
        : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
    });
    const result: unknown = await response.json();
    if (!response.ok) {
      const parsed = errorSchema.safeParse(result);
      const code = parsed.success ? parsed.data.error.code : "SNAPSHOT_UNAVAILABLE";
      throw new SnapshotClientError(
        code,
        messages[code] ?? "기록을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.",
      );
    }
    return result;
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    if (error instanceof SnapshotClientError) throw error;
    throw new SnapshotClientError(
      "NETWORK_ERROR",
      "연결이 끊어졌습니다. 잠시 후 다시 시도해주세요.",
    );
  }
}
export interface SnapshotReceipt {
  s3Key: string;
  etag: string;
  idempotencyKey: string;
}
export async function finishSnapshot(receipt: SnapshotReceipt, signal: AbortSignal) {
  const parsed = z
    .object({ success: z.literal(true), data: snapshotSchema })
    .safeParse(await snapshotRequest("/api/v1/snapshots", signal, receipt));
  if (!parsed.success)
    throw new SnapshotClientError(
      "INVALID_RESPONSE",
      "기록 결과를 확인하지 못했습니다. 다시 불러와주세요.",
    );
  return parsed.data.data;
}
export async function loadTodaySnapshot(signal: AbortSignal) {
  const parsed = todaySnapshotResponse.safeParse(
    await snapshotRequest("/api/v1/snapshots/today", signal),
  );
  if (!parsed.success)
    throw new SnapshotClientError(
      "INVALID_RESPONSE",
      "기록을 불러오지 못했습니다. 다시 시도해주세요.",
    );
  return parsed.data.data;
}
const issueSchema = z.object({
  success: z.literal(true),
  data: z.object({
    uploadSessionId: z.string().min(1),
    uploadUrl: z.url(),
    s3Key: snapshotKeySchema,
    recordDate: z.string(),
    expiresInSeconds: z.literal(300),
  }),
});
export async function uploadSnapshotPhoto(
  image: ProcessedImageResult,
  signal: AbortSignal,
  report: (phase: string, progress?: number) => void,
  onReceipt: (receipt: SnapshotReceipt) => void,
) {
  report("보안 업로드 링크를 준비하고 있어요.");
  const issued = issueSchema.safeParse(
    await snapshotRequest("/api/v1/snapshots/upload-url", signal, {
      mimeType: image.mimeType,
      fileSizeBytes: image.fileSizeBytes,
    }),
  );
  if (!issued.success)
    throw new SnapshotClientError(
      "INVALID_RESPONSE",
      "업로드 링크를 확인하지 못했습니다. 다시 선택해주세요.",
    );
  report("사진을 안전하게 전송하고 있어요.", 0);
  const etag = normalizeETag(
    await putImage(issued.data.data.uploadUrl, image, signal, (progress) =>
      report("사진을 안전하게 전송하고 있어요.", progress),
    ),
  );
  const receipt = { s3Key: issued.data.data.s3Key, etag, idempotencyKey: crypto.randomUUID() };
  onReceipt(receipt);
  report("업로드를 확인하고 오늘의 관리 안내를 준비하고 있어요.");
  return finishSnapshot(receipt, signal);
}
