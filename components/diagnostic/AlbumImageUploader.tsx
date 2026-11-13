"use client";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { CheckCircle2, ImagePlus, LoaderCircle } from "lucide-react";
import {
  preprocessAlbumImage,
  validateAlbumFile,
  type ProcessedImageResult,
} from "@/lib/image/clientPreprocess";
import {
  ImageUploadError,
  uploadDiagnosticImage,
  type OnUploadCompletePayload,
  type UploadPhase,
} from "@/lib/api/diagnosticUploadClient";
import { useUploadActivity } from "./UploadActivity";
type Phase = "idle" | "prepare" | UploadPhase | "success" | "failure";
const phaseLabels = {
  idle: "사진을 선택해 주세요.",
  prepare: "사진을 최적화하고 있어요.",
  link: "보안 업로드 링크를 준비하고 있어요.",
  transfer: "사진을 안전하게 전송하고 있어요.",
  confirm: "사진 업로드를 검증하고 있어요.",
  success: "사진이 안전하게 등록되었습니다.",
  failure: "사진 등록을 완료하지 못했어요.",
};
export function AlbumImageUploader({
  onUploadComplete,
}: {
  onUploadComplete: (payload: OnUploadCompletePayload | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const running = useRef<AbortController | null>(null);
  const original = useRef<File | null>(null);
  const processed = useRef<ProcessedImageResult | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [canRetry, setCanRetry] = useState(false);
  const { setBusy } = useUploadActivity();
  const pending = ["prepare", "link", "transfer", "confirm"].includes(phase);
  useEffect(
    () => () => {
      running.current?.abort();
      running.current = null;
      if (processed.current) URL.revokeObjectURL(processed.current.previewUrl);
      processed.current = null;
      original.current = null;
      setBusy(false);
    },
    [setBusy],
  );
  function discard() {
    if (processed.current) URL.revokeObjectURL(processed.current.previewUrl);
    processed.current = null;
    original.current = null;
    setPreview(null);
  }
  async function run(file: File) {
    if (running.current) return;
    const controller = new AbortController();
    running.current = controller;
    setBusy(true);
    setError("");
    setCanRetry(false);
    setProgress(0);
    onUploadComplete(null);
    try {
      setPhase("prepare");
      let image = processed.current;
      if (!image) {
        image = await preprocessAlbumImage(file, controller.signal);
        if (running.current !== controller) {
          URL.revokeObjectURL(image.previewUrl);
          return;
        }
        processed.current = image;
        setPreview(image.previewUrl);
      }
      const result = await uploadDiagnosticImage(image, controller.signal, (next, value) => {
        if (running.current !== controller) return;
        setPhase(next);
        if (value !== undefined) setProgress(value);
      });
      if (running.current !== controller) return;
      setProgress(100);
      setPhase("success");
      onUploadComplete(result);
    } catch (failure) {
      if (running.current !== controller) return;
      setPhase("failure");
      setError(
        failure instanceof Error
          ? failure.message
          : "사진을 처리하지 못했습니다. 다른 사진을 선택해주세요.",
      );
      setCanRetry(failure instanceof ImageUploadError && failure.phase !== "confirm");
    } finally {
      if (running.current === controller) {
        running.current = null;
        setBusy(false);
      }
    }
  }
  function select(event: ChangeEvent<HTMLInputElement>) {
    if (running.current) return;
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    discard();
    onUploadComplete(null);
    setError("");
    setCanRetry(false);
    try {
      validateAlbumFile(file);
    } catch (failure) {
      setPhase("failure");
      setError(failure instanceof Error ? failure.message : "사진을 다시 선택해주세요.");
      return;
    }
    original.current = file;
    void run(file);
  }
  return (
    <section
      aria-labelledby="album-heading"
      aria-busy={pending}
      className="mt-6 space-y-4 rounded-2xl border border-neutral-200 bg-surface p-5"
    >
      <div className="flex items-center gap-3">
        <ImagePlus
          aria-hidden="true"
          size={24}
          strokeWidth={1.75}
          className="shrink-0 text-primary-700"
        />
        <h2 id="album-heading" className="text-lg font-semibold text-neutral-900">
          앨범 사진으로 시작해요
        </h2>
      </div>
      <p id="album-help" className="text-sm leading-relaxed text-neutral-600">
        선글라스, 마스크, 짙은 색조 메이크업을 지양한 정면 얼굴 사진을 선택해주세요. JPG·PNG·WebP,
        10KB~10MB를 지원해요.
      </p>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label="앨범 사진 파일"
        aria-describedby="album-help"
        disabled={pending}
        onChange={select}
        className="hidden"
      />
      {preview && (
        <div className="relative overflow-hidden rounded-xl bg-surface-muted">
          {/* Local object URLs are private, temporary browser memory and cannot use the Next image optimizer. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- A revocable local object URL must stay in this browser. */}
          <img
            src={preview}
            alt="선택한 정면 사진 미리보기"
            className="max-h-72 w-full object-contain"
          />
          {phase === "success" && (
            <CheckCircle2
              aria-label="사진 등록 완료"
              size={28}
              className="absolute right-2 top-2 rounded-full bg-surface text-primary-700"
            />
          )}
        </div>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => input.current?.click()}
        className="button-primary w-full"
      >
        {phase === "idle" ? "앨범에서 사진 선택" : "사진 다시 선택"}
      </button>
      <p
        role="status"
        aria-atomic="true"
        className="flex items-center gap-2 text-sm leading-relaxed text-neutral-700"
      >
        {pending && (
          <LoaderCircle
            aria-hidden="true"
            size={18}
            className="shrink-0 motion-safe:animate-spin"
          />
        )}
        {phaseLabels[phase]}
      </p>
      {(pending || phase === "success") && (
        <div>
          <progress
            aria-label="사진 전송 진행률"
            max={100}
            value={phase === "transfer" ? progress : phase === "success" ? 100 : undefined}
            className="h-2 w-full accent-primary-700"
          />
          {phase === "transfer" && (
            <p className="mt-1 text-right text-xs tabular-nums text-neutral-600">{progress}%</p>
          )}
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="space-y-3 rounded-xl bg-status-danger-surface p-4 text-sm leading-relaxed text-status-danger"
        >
          <p>{error}</p>
          {canRetry && (
            <button
              type="button"
              className="button-secondary w-full"
              onClick={() => {
                if (original.current) void run(original.current);
              }}
            >
              다시 시도
            </button>
          )}
        </div>
      )}
      {pending && (
        <p className="text-xs leading-relaxed text-neutral-600">
          전송이 끝날 때까지 이 화면에서 기다려 주세요. 다른 메뉴로의 이동은 잠시 멈춥니다.
        </p>
      )}
    </section>
  );
}
