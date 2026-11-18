"use client";
import { useEffect, useId, useRef, useState } from "react";
import { SwitchCamera } from "lucide-react";
import { useCameraStream } from "@/hooks/useCameraStream";
import {
  captureViewfinder,
  type OnCameraCaptureCompletePayload,
} from "@/lib/image/viewfinderCapture";
import { uploadFileSchema } from "@/lib/diagnostic/upload-validation";
import {
  uploadDiagnosticImage,
  ImageUploadError,
  type OnUploadCompletePayload,
  type UploadPhase,
} from "@/lib/api/diagnosticUploadClient";
import { useUploadActivity } from "./UploadActivity";
import { QualityWarningModal } from "./QualityWarningModal";
type Capture = Awaited<ReturnType<typeof captureViewfinder>>;
export function CameraViewfinder({
  previewOnly = false,
  onAlbum,
  onUploadComplete,
  onCaptureComplete,
  requestConsent,
}: {
  previewOnly?: boolean;
  requestConsent?: () => Promise<boolean>;
  onAlbum: () => void;
  onUploadComplete?: (payload: OnUploadCompletePayload | null) => void;
  onCaptureComplete?: (payload: OnCameraCaptureCompletePayload) => void;
}) {
  const { stream, status, start: openCamera, stop: stopCamera } = useCameraStream();
  const video = useRef<HTMLVideoElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const image = useRef<Capture | null>(null);
  const running = useRef<AbortController | null>(null);
  const captureToken = useRef(0);
  const { setBusy } = useUploadActivity();
  const maskId = useId();
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [draft, setDraft] = useState<Capture | null>(null);
  const [warning, setWarning] = useState(false);
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<UploadPhase | null>(null);
  const [progress, setProgress] = useState(0);
  const [complete, setComplete] = useState(false);
  useEffect(() => {
    let active = true;
    const element = video.current;
    if (!element) return;
    element.srcObject = stream;
    if (stream)
      void element.play().catch(() => {
        if (!active) return;
        setReady(false);
        setError("카메라 영상을 재생하지 못했습니다. 카메라를 다시 켜거나 앨범을 이용해주세요.");
        stopCamera();
      });
    return () => {
      active = false;
      element.srcObject = null;
    };
  }, [stream, stopCamera]);
  useEffect(
    () => () => {
      captureToken.current++;
      running.current?.abort();
      if (image.current) URL.revokeObjectURL(image.current.processedImage.previewUrl);
      setBusy(false);
    },
    [setBusy],
  );
  function discard() {
    captureToken.current++;
    if (image.current) URL.revokeObjectURL(image.current.processedImage.previewUrl);
    image.current = null;
    setDraft(null);
    setWarning(false);
    setError("");
    setComplete(false);
    onUploadComplete?.(null);
  }
  async function start(next = facing) {
    if (!previewOnly && requestConsent && !(await requestConsent())) {
      stopCamera();
      return;
    }
    discard();
    setReady(false);
    setFacing(next);
    void openCamera(next);
  }
  async function shoot() {
    if (!video.current || capturing || !ready) return;
    if (!previewOnly && requestConsent && !(await requestConsent())) {
      stopCamera();
      return;
    }
    const token = ++captureToken.current;
    setCapturing(true);
    setError("");
    try {
      const result = await captureViewfinder(video.current);
      if (token !== captureToken.current) {
        URL.revokeObjectURL(result.processedImage.previewUrl);
        return;
      }
      stopCamera();
      image.current = result;
      setDraft(result);
      setWarning(!result.qualityMetrics.isValidQuality);
    } catch {
      if (token === captureToken.current)
        setError("사진을 촬영하지 못했습니다. 카메라 화면이 준비되면 다시 시도해주세요.");
    } finally {
      if (token === captureToken.current) setCapturing(false);
    }
  }
  async function confirm() {
    if (!draft || running.current) return;
    setError("");
    if (previewOnly) {
      onCaptureComplete?.(draft);
      setComplete(true);
      return;
    }
    if (requestConsent && !(await requestConsent())) return;
    if (
      !uploadFileSchema.safeParse({
        mimeType: draft.processedImage.mimeType,
        fileSizeBytes: draft.processedImage.fileSizeBytes,
      }).success
    ) {
      setError("사진 용량이 허용 범위(10KB~10MB)를 벗어났습니다. 밝은 곳에서 다시 촬영해주세요.");
      return;
    }
    const controller = new AbortController();
    running.current = controller;
    setBusy(true);
    setProgress(0);
    try {
      const result = await uploadDiagnosticImage(
        draft.processedImage,
        controller.signal,
        (next, value) => {
          if (running.current !== controller) return;
          setPhase(next);
          if (value !== undefined) setProgress(value);
        },
      );
      if (running.current === controller) {
        setComplete(true);
        onUploadComplete?.(result);
        onCaptureComplete?.({
          ...draft,
          uploadSessionId: result.uploadSessionId,
          s3Key: result.s3Key,
        });
      }
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(
          failure instanceof ImageUploadError
            ? failure.message
            : "이미지 전송 중 네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
        );
    } finally {
      if (running.current === controller) {
        running.current = null;
        setPhase(null);
        setBusy(false);
      }
    }
  }
  const pending = phase !== null;
  return (
    <section
      aria-labelledby="camera-heading"
      className="mt-5 space-y-4 rounded-2xl border border-neutral-200 bg-surface p-4"
    >
      <h2 id="camera-heading" className="text-lg font-semibold">
        가이드에 맞춰 촬영해요
      </h2>
      {previewOnly && (
        <p className="text-sm text-primary-800">
          사진 테스트 모드: 사진은 이 기기에만 표시하며 서버로 전송하거나 분석하지 않습니다.
        </p>
      )}
      {!draft && (
        <>
          <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-neutral-900">
            <video
              ref={video}
              autoPlay
              playsInline
              muted
              aria-label={facing === "user" ? "전면 카메라 미리보기" : "후면 카메라 미리보기"}
              onLoadedData={() => setReady(true)}
              className={`h-full w-full object-cover ${facing === "user" ? "-scale-x-100" : ""}`}
            />
            <svg
              viewBox="0 0 400 300"
              preserveAspectRatio="none"
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 h-full w-full text-surface"
            >
              <defs>
                <mask id={maskId}>
                  <rect width="400" height="300" fill="white" />
                  <ellipse cx="200" cy="150" rx="80" ry="120" fill="black" />
                </mask>
              </defs>
              <rect
                width="400"
                height="300"
                fill="currentColor"
                fillOpacity=".18"
                mask={`url(#${maskId})`}
              />
              <ellipse
                cx="200"
                cy="150"
                rx="80"
                ry="120"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                d="M140 115H260 M165 205H235 M200 60V240"
                fill="none"
                stroke="currentColor"
                strokeDasharray="5 6"
              />
            </svg>
          </div>
          <p className="text-sm leading-relaxed text-neutral-700">
            얼굴을 타원형 가이드 안에 맞춰주세요. 밝은 곳에서 기기를 흔들리지 않게 잡아주세요.
          </p>
          <p role="status" className="text-sm text-neutral-700">
            {status === "requesting"
              ? "카메라를 준비하고 있습니다..."
              : capturing
                ? "사진을 준비하고 있습니다..."
                : status === "active"
                  ? "카메라가 켜져 있습니다."
                  : "촬영을 시작하려면 카메라를 켜주세요."}
          </p>
          {(status === "denied" || status === "unsupported") && (
            <p
              role="alert"
              className="rounded-xl bg-status-danger-surface p-3 text-sm text-status-danger"
            >
              카메라 접근 권한이 거부되었거나 지원되지 않는 기기입니다. 브라우저 설정에서 카메라
              권한을 허용하시거나, 앨범에서 사진을 업로드해주세요.
            </p>
          )}
          {status !== "active" && (
            <button
              type="button"
              disabled={status === "requesting"}
              onClick={() => start()}
              className="button-primary w-full"
            >
              카메라 켜기
            </button>
          )}
          {status === "active" && (
            <div className="flex items-center justify-center gap-4">
              <button
                type="button"
                disabled={!ready || capturing}
                onClick={() => void shoot()}
                className="button-primary min-h-16 min-w-16 rounded-full"
              >
                촬영
              </button>
              <button
                type="button"
                aria-label="전면/후면 카메라 전환"
                disabled={capturing}
                onClick={() => start(facing === "user" ? "environment" : "user")}
                className="button-secondary flex h-12 w-12 items-center justify-center p-0"
              >
                <SwitchCamera aria-hidden="true" strokeWidth={1.75} />
              </button>
            </div>
          )}
          {(status === "active" || status === "requesting") && (
            <button
              type="button"
              onClick={() => {
                setReady(false);
                stopCamera();
              }}
              className="button-secondary w-full"
            >
              카메라 끄기
            </button>
          )}
        </>
      )}
      {draft && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- temporary object URL remains in browser memory */}
          <img
            src={draft.processedImage.previewUrl}
            alt="촬영한 얼굴 사진 미리보기"
            className="max-h-80 w-full rounded-xl object-contain"
          />
          <button
            type="button"
            ref={confirmButton}
            disabled={pending || complete}
            onClick={() => void confirm()}
            className="button-primary w-full"
          >
            {pending
              ? "사진을 안전하게 전송하고 있어요…"
              : previewOnly
                ? "이 사진 미리보기"
                : "이 사진으로 진단 시작"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => start()}
            className="button-secondary w-full"
          >
            다시 촬영
          </button>
          {pending && (
            <>
              <p role="status" className="text-sm">
                {phase === "link"
                  ? "업로드 링크를 준비하고 있어요."
                  : phase === "transfer"
                    ? `사진 전송 ${progress}%`
                    : "사진 업로드를 확인하고 있어요."}
              </p>
              <progress
                aria-label="촬영 사진 전송 진행률"
                className="w-full accent-primary-700"
                max={100}
                value={phase === "transfer" ? progress : undefined}
              />
            </>
          )}
          {complete && (
            <p role="status" className="text-sm text-primary-800">
              {previewOnly
                ? "사진을 이 기기에서만 미리보고 있어요. 저장하거나 분석하지 않았습니다."
                : "사진 업로드가 완료되었습니다. 아래에서 문진으로 이어가세요."}
            </p>
          )}
        </>
      )}
      {error && (
        <div
          role="alert"
          className="space-y-3 rounded-xl bg-status-danger-surface p-3 text-sm text-status-danger"
        >
          <p>{error}</p>
          {draft && !previewOnly && (
            <button
              type="button"
              disabled={pending}
              onClick={() => void confirm()}
              className="button-secondary w-full"
            >
              다시 시도
            </button>
          )}
        </div>
      )}
      <button
        type="button"
        disabled={pending}
        className="button-secondary w-full"
        onClick={() => {
          stopCamera();
          discard();
          onAlbum();
        }}
      >
        앨범에서 사진 선택하기
      </button>
      {warning && (
        <QualityWarningModal
          onRetry={() => start()}
          onProceed={() => {
            setWarning(false);
            confirmButton.current?.focus();
          }}
        />
      )}
    </section>
  );
}
