"use client";
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { Camera, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { SocialAuthModal } from "@/components/auth/SocialAuthModal";
import { useUploadActivity } from "@/components/diagnostic/UploadActivity";
import { preprocessAlbumImage, type ProcessedImageResult } from "@/lib/image/clientPreprocess";
import {
  finishSnapshot,
  loadTodaySnapshot,
  SnapshotClientError,
  uploadSnapshotPhoto,
  type SnapshotReceipt,
} from "@/lib/snapshot/client";
import type { SnapshotView } from "@/lib/snapshot/types";
import { TodayFeedbackCard } from "./TodayFeedbackCard";
export function DailySnapshotRecorder({
  initialSnapshot,
  initialError = false,
}: {
  initialSnapshot: SnapshotView | null;
  initialError?: boolean;
}) {
  const router = useRouter();
  const { setBusy } = useUploadActivity();
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [failure, setFailure] = useState(
    initialError ? "기록을 불러오지 못했습니다. 다시 불러와주세요." : "",
  );
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [opening, setOpening] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [hasFile, setHasFile] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const cameraVersion = useRef(0);
  const work = useRef<AbortController | null>(null);
  const image = useRef<ProcessedImageResult | null>(null);
  const receipt = useRef<SnapshotReceipt | null>(null);
  const original = useRef<File | null>(null);
  const closeCamera = useCallback(() => {
    cameraVersion.current++;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    setCameraOpen(false);
    setOpening(false);
  }, []);
  useEffect(
    () => () => {
      cameraVersion.current++;
      stream.current?.getTracks().forEach((track) => track.stop());
      work.current?.abort();
      work.current = null;
      if (image.current) URL.revokeObjectURL(image.current.previewUrl);
      setBusy(false);
    },
    [setBusy],
  );
  useEffect(() => {
    let active = true;
    if (cameraOpen && video.current && stream.current) {
      video.current.srcObject = stream.current;
      void video.current.play().catch(() => {
        if (active) {
          setFailure("카메라 화면을 재생하지 못했습니다. 앨범 사진을 선택해주세요.");
          closeCamera();
        }
      });
    }
    return () => {
      active = false;
    };
  }, [cameraOpen, closeCamera]);
  async function openCamera() {
    if (opening || pending || stream.current) return;
    setFailure("");
    setOpening(true);
    const version = ++cameraVersion.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Unavailable");
      const result = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      if (version !== cameraVersion.current) {
        result.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = result;
      setCameraOpen(true);
      setOpening(false);
    } catch {
      if (version !== cameraVersion.current) return;
      setOpening(false);
      setFailure("카메라에 접근할 수 없습니다. 권한을 허용하거나 앨범 사진을 선택해주세요.");
    }
  }
  function discard() {
    if (image.current) URL.revokeObjectURL(image.current.previewUrl);
    image.current = null;
    receipt.current = null;
    original.current = null;
    setPreview(null);
    setHasFile(false);
  }
  async function refresh() {
    if (work.current) return;
    const controller = new AbortController();
    work.current = controller;
    setPending(true);
    setBusy(true);
    setFailure("");
    setMessage("오늘의 기록을 불러오고 있어요.");
    try {
      const result = await loadTodaySnapshot(controller.signal);
      if (work.current === controller) {
        setSnapshot(result.snapshot);
        setNeedsLogin(false);
        router.refresh();
      }
    } catch (error) {
      if (work.current === controller) {
        setFailure(error instanceof Error ? error.message : "기록을 불러오지 못했습니다.");
        setNeedsLogin(error instanceof SnapshotClientError && error.code === "SESSION_REQUIRED");
      }
    } finally {
      if (work.current === controller) {
        work.current = null;
        setPending(false);
        setBusy(false);
        setMessage("");
      }
    }
  }
  async function run(file: File) {
    if (work.current) return;
    closeCamera();
    const controller = new AbortController();
    work.current = controller;
    setPending(true);
    setBusy(true);
    setFailure("");
    setProgress(null);
    setMessage("사진을 최적화하고 있어요.");
    try {
      let processed = image.current;
      if (!processed) {
        processed = await preprocessAlbumImage(file, controller.signal);
        if (work.current !== controller) {
          URL.revokeObjectURL(processed.previewUrl);
          return;
        }
        image.current = processed;
        setPreview(processed.previewUrl);
      }
      const result = receipt.current
        ? await finishSnapshot(receipt.current, controller.signal)
        : await uploadSnapshotPhoto(
            processed,
            controller.signal,
            (text, value) => {
              if (work.current === controller) {
                setMessage(text);
                setProgress(value ?? null);
              }
            },
            (value) => {
              receipt.current = value;
            },
          );
      if (work.current === controller) {
        setSnapshot(result);
        router.refresh();
      }
    } catch (error) {
      if (work.current !== controller) return;
      setFailure(
        error instanceof Error ? error.message : "사진 기록에 실패했습니다. 다시 시도해주세요.",
      );
      if (error instanceof SnapshotClientError) {
        setNeedsLogin(error.code === "SESSION_REQUIRED");
        if (
          ["INVALID_SNAPSHOT_DATA", "SNAPSHOT_UPLOAD_EXPIRED", "IDEMPOTENCY_CONFLICT"].includes(
            error.code,
          )
        )
          receipt.current = null;
        if (error.code === "ALREADY_RECORDED_TODAY") {
          try {
            const today = await loadTodaySnapshot(controller.signal);
            if (work.current === controller) setSnapshot(today.snapshot);
          } catch {
            setFailure("오늘의 기록이 이미 있습니다. 다시 불러와주세요.");
          }
        }
      }
    } finally {
      if (work.current === controller) {
        work.current = null;
        setPending(false);
        setBusy(false);
        setMessage("");
        setProgress(null);
      }
    }
  }
  function select(event: ChangeEvent<HTMLInputElement>) {
    if (work.current) return;
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    discard();
    original.current = file;
    setHasFile(true);
    void run(file);
  }
  async function capture() {
    if (!video.current || pending) return;
    const source = video.current;
    if (!source.videoWidth || !source.videoHeight) {
      setFailure("카메라가 준비되지 않았어요. 잠시 후 다시 시도해주세요.");
      return;
    }
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1280 / Math.max(source.videoWidth, source.videoHeight));
    canvas.width = Math.round(source.videoWidth * scale);
    canvas.height = Math.round(source.videoHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) {
      setFailure("촬영을 처리하지 못했습니다. 앨범 사진을 선택해주세요.");
      return;
    }
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const version = cameraVersion.current;
    setOpening(true);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85),
    );
    canvas.width = 0;
    canvas.height = 0;
    if (version !== cameraVersion.current) return;
    setOpening(false);
    if (!blob) {
      setFailure("촬영을 처리하지 못했습니다. 다시 시도해주세요.");
      return;
    }
    discard();
    const file = new File([blob], "snapshot.jpg", { type: "image/jpeg" });
    original.current = file;
    setHasFile(true);
    void run(file);
  }
  return (
    <div className="space-y-5">
      {snapshot ? (
        <TodayFeedbackCard
          key={snapshot.viewUrl}
          snapshot={snapshot}
          onRefresh={() => void refresh()}
        />
      ) : (
        <section
          aria-labelledby="snapshot-form-heading"
          className="space-y-4 rounded-2xl border border-neutral-200 p-5"
          aria-busy={pending}
        >
          <Camera aria-hidden="true" size={28} className="text-primary-700" />
          <h2 id="snapshot-form-heading" className="text-lg font-semibold">
            오늘의 피부 스냅샷을 남겨보세요
          </h2>
          <p className="text-sm leading-relaxed text-neutral-600">
            얼굴 정면이 잘 보이도록 밝은 조명에서 촬영해주세요. JPG·PNG·WebP, 10KB~10MB를 지원해요.
            하루 한 번, 한국 시간 기준으로 기록합니다.
          </p>
          {cameraOpen && (
            <div className="space-y-3">
              <div className="relative overflow-hidden rounded-xl bg-surface-muted">
                <video
                  ref={video}
                  autoPlay
                  muted
                  playsInline
                  aria-label="전면 카메라 미리보기"
                  className="w-full"
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-[20%] inset-y-[10%] rounded-full border-2 border-primary-700"
                />
              </div>
              <button
                type="button"
                disabled={pending || opening}
                className="button-primary w-full"
                onClick={() => void capture()}
              >
                사진 촬영
              </button>
              <button
                type="button"
                disabled={pending}
                className="button-secondary w-full"
                onClick={closeCamera}
              >
                카메라 닫기
              </button>
            </div>
          )}
          {preview && !cameraOpen && (
            // eslint-disable-next-line @next/next/no-img-element -- Temporary private object URL stays in this browser.
            <img
              src={preview}
              alt="등록할 스냅샷 미리보기"
              className="max-h-72 w-full rounded-xl object-contain"
            />
          )}
          <button
            type="button"
            disabled={pending || opening}
            className="button-secondary w-full"
            onClick={() => void openCamera()}
          >
            {opening ? "카메라 준비 중..." : "카메라로 촬영하기"}
          </button>
          <button
            type="button"
            disabled={pending || opening}
            className="button-primary w-full"
            onClick={() => fileInput.current?.click()}
          >
            앨범에서 선택하기
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="스냅샷 사진 파일"
            disabled={pending}
            className="hidden"
            onChange={select}
          />
        </section>
      )}
      {pending && (
        <div role="status" className="space-y-2 text-sm text-neutral-700">
          <p className="flex items-center gap-2">
            <LoaderCircle
              aria-hidden="true"
              size={18}
              className="shrink-0 motion-safe:animate-spin"
            />
            {message}
          </p>
          <progress
            aria-label="스냅샷 전송 진행률"
            max={100}
            value={progress ?? undefined}
            className="h-2 w-full accent-primary-700"
          />
        </div>
      )}
      {failure && (
        <div
          role="alert"
          className="space-y-3 rounded-xl bg-status-danger-surface p-4 text-sm leading-relaxed text-status-danger"
        >
          <p>{failure}</p>
          {hasFile && !needsLogin && (
            <button
              type="button"
              disabled={pending}
              className="button-secondary w-full"
              onClick={() => {
                if (original.current) void run(original.current);
              }}
            >
              다시 시도
            </button>
          )}
          <button
            type="button"
            disabled={pending}
            className="button-secondary w-full"
            onClick={() => void refresh()}
          >
            기록 다시 불러오기
          </button>
          {needsLogin && <SocialAuthModal />}
        </div>
      )}
    </div>
  );
}
