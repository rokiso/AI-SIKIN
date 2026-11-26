"use client";
import { useEffect, useId, useRef, useState, type PointerEvent } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, LoaderCircle } from "lucide-react";
import {
  defaultAdjustment,
  constrainAdjustment,
  drawAdjusted,
  exportAdjustedImage,
  prepareAdjustmentImage,
  zoomAdjustment,
  type AdjustmentImage,
  type AdjustmentSummary,
  type ImageAdjustmentState,
} from "@/lib/image/canvasAdjuster";
import type { ProcessedImageResult } from "@/lib/image/clientPreprocess";
import { PhotoQualityError, type QualityFailureReason } from "@/lib/image/faceQualityValidator";
import { QualityWarningModal } from "./QualityWarningModal";

type Point = { x: number; y: number };
export function ManualPhotoAdjuster({
  file,
  onConfirm,
  onChooseAnother,
  onBusyChange,
  previewOnly = false,
}: {
  file: File;
  onConfirm: (image: ProcessedImageResult, summary: AdjustmentSummary) => Promise<void>;
  onChooseAnother: () => void;
  onBusyChange: (busy: boolean) => void;
  previewOnly?: boolean;
}) {
  const id = useId();
  const canvas = useRef<HTMLCanvasElement>(null);
  const zoom = useRef<HTMLInputElement>(null);
  const exporting = useRef<AbortController | null>(null);
  const points = useRef(new Map<number, Point>());
  const latest = useRef<ImageAdjustmentState>({ ...defaultAdjustment });
  const [state, setState] = useState<ImageAdjustmentState>({ ...defaultAdjustment });
  const [loaded, setLoaded] = useState<{ file: File; image: AdjustmentImage } | null>(null);
  const [loadError, setLoadError] = useState<{ file: File; text: string } | null>(null);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState<QualityFailureReason | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const image = loaded?.file === file ? loaded.image : null;
  const loading = !image && loadError?.file !== file;
  const busy = loading || submitting;
  useEffect(() => {
    const controller = new AbortController();
    const activePoints = points.current;
    let prepared: AdjustmentImage | undefined;
    void prepareAdjustmentImage(file, controller.signal)
      .then((value) => {
        if (controller.signal.aborted) {
          value.close();
          return;
        }
        prepared = value;
        latest.current = { ...defaultAdjustment };
        setState({ ...defaultAdjustment });
        setLoaded({ file, image: value });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setLoadError({ file, text: "이미지를 불러올 수 없습니다. 다른 사진을 선택해주세요." });
      });
    return () => {
      controller.abort();
      exporting.current?.abort();
      prepared?.close();
      activePoints.clear();
    };
  }, [file]);
  useEffect(() => {
    onBusyChange(busy);
    return () => onBusyChange(false);
  }, [busy, onBusyChange]);
  useEffect(() => {
    if (!image) return;
    const frame = requestAnimationFrame(() => {
      if (!canvas.current) return;
      try {
        drawAdjusted(canvas.current, image, state, 400);
      } catch {
        setError("사진 미리보기를 표시할 수 없습니다. 다른 사진을 선택해주세요.");
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [image, state]);
  useEffect(() => {
    const preview = canvas.current;
    return () => {
      if (preview) preview.width = preview.height = 0;
    };
  }, [image]);
  function change(next: ImageAdjustmentState) {
    if (!image || busy) return;
    latest.current = constrainAdjustment(image.width, image.height, next);
    setState(latest.current);
    setError("");
  }
  function move(x: number, y: number) {
    change({
      ...latest.current,
      offsetX: latest.current.offsetX + x,
      offsetY: latest.current.offsetY + y,
    });
  }
  function pointerMove(event: PointerEvent<HTMLCanvasElement>) {
    if (!image || busy || !points.current.has(event.pointerId)) return;
    const previous = [...points.current.values()];
    points.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const current = [...points.current.values()];
    const box = event.currentTarget.getBoundingClientRect();
    if (!box.width) return;
    const ratio = 1280 / box.width;
    if (current.length === 1)
      move((current[0].x - previous[0].x) * ratio, (current[0].y - previous[0].y) * ratio);
    else if (current.length === 2) {
      const distance = (p: Point[]) => Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y);
      const before = distance(previous);
      if (before < 1) return;
      const center = (p: Point[]) => ({ x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 });
      const a = center(previous),
        b = center(current);
      const next = zoomAdjustment(
        image.width,
        image.height,
        latest.current,
        (latest.current.scale * distance(current)) / before,
        (a.x - box.left - box.width / 2) * ratio,
        (a.y - box.top - box.height / 2) * ratio,
      );
      change({
        ...next,
        offsetX: next.offsetX + (b.x - a.x) * ratio,
        offsetY: next.offsetY + (b.y - a.y) * ratio,
      });
    }
  }
  async function confirm() {
    if (!image || busy || exporting.current) return;
    const controller = new AbortController();
    exporting.current = controller;
    setSubmitting(true);
    setError("");
    let result: ProcessedImageResult | undefined;
    let handedOff = false;
    try {
      const value = { ...latest.current };
      result = await exportAdjustedImage(image, value, controller.signal);
      controller.signal.throwIfAborted();
      // The caller owns the exported object URL from this point, including retry/unmount cleanup.
      handedOff = true;
      await onConfirm(result, {
        appliedBrightness: value.brightness,
        appliedContrast: value.contrast,
        appliedScale: value.scale,
      });
    } catch (failure) {
      if (result && !handedOff) URL.revokeObjectURL(result.previewUrl);
      if (!controller.signal.aborted) {
        if (failure instanceof PhotoQualityError) setWarning(failure.reason);
        else
          setError(
            failure instanceof Error
              ? failure.message
              : "사진 보정에 실패했습니다. 다시 시도해주세요.",
          );
      }
    } finally {
      if (!controller.signal.aborted) setSubmitting(false);
      if (exporting.current === controller) exporting.current = null;
    }
  }
  const controls = [
    { key: "scale", label: "확대/축소", min: 1, max: 3, step: 0.05 },
    { key: "brightness", label: "밝기 조절", min: -50, max: 50, step: 1 },
    { key: "contrast", label: "대비 조절", min: -50, max: 50, step: 1 },
  ] as const;
  const dismiss = () => {
    setWarning(null);
    zoom.current?.focus();
  };
  return (
    <section
      aria-labelledby={`${id}-title`}
      aria-busy={busy}
      className="space-y-4 break-keep [overflow-wrap:break-word]"
    >
      <h3 id={`${id}-title`} className="text-lg font-semibold text-neutral-900">
        사진 위치와 조명 보정
      </h3>
      <p id={`${id}-help`} className="text-sm leading-relaxed text-neutral-700">
        타원 안에 눈, 코, 입이 중앙에 오도록 위치와 밝기를 조절해주세요.
      </p>
      {loading && (
        <p role="status" className="flex items-center gap-2 text-sm">
          <LoaderCircle aria-hidden="true" className="h-5 w-5 motion-safe:animate-spin" />
          사진을 불러오는 중입니다...
        </p>
      )}
      {image && (
        <>
          <div className="relative mx-auto aspect-square w-full max-w-[400px] overflow-hidden rounded-xl bg-surface-muted">
            <canvas
              ref={canvas}
              width={400}
              height={400}
              aria-label="보정할 사진"
              aria-describedby={`${id}-help`}
              className="h-full w-full touch-none"
              onPointerDown={(event) => {
                if (busy || points.current.size >= 2) return;
                points.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={pointerMove}
              onPointerUp={(event) => points.current.delete(event.pointerId)}
              onPointerCancel={(event) => points.current.delete(event.pointerId)}
              onLostPointerCapture={(event) => points.current.delete(event.pointerId)}
            />
            <svg
              viewBox="0 0 400 400"
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 h-full w-full"
            >
              <defs>
                <mask id={`${id}-mask`}>
                  <rect width="400" height="400" fill="white" />
                  <ellipse cx="200" cy="200" rx="104" ry="154" fill="black" />
                </mask>
              </defs>
              <rect
                width="400"
                height="400"
                className="fill-neutral-900"
                fillOpacity=".3"
                mask={`url(#${id}-mask)`}
              />
              <ellipse
                cx="200"
                cy="200"
                rx="104"
                ry="154"
                fill="none"
                className="stroke-neutral-900"
                strokeWidth="5"
              />
              <ellipse
                cx="200"
                cy="200"
                rx="104"
                ry="154"
                fill="none"
                className="stroke-surface"
                strokeWidth="2"
                strokeDasharray="6 5"
              />
            </svg>
          </div>
          <fieldset disabled={busy} className="space-y-3">
            <legend className="mb-2 text-sm font-semibold">사진 이동</legend>
            <p className="text-xs leading-relaxed text-neutral-600">
              사진을 끌거나 방향 버튼을 이용하세요. 확대하면 이동할 수 있는 범위가 넓어져요.
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "사진 위로 이동", icon: ArrowUp, x: 0, y: -64 },
                { label: "사진 아래로 이동", icon: ArrowDown, x: 0, y: 64 },
                { label: "사진 왼쪽으로 이동", icon: ArrowLeft, x: -64, y: 0 },
                { label: "사진 오른쪽으로 이동", icon: ArrowRight, x: 64, y: 0 },
              ].map(({ label, icon: Icon, x, y }) => (
                <button
                  key={label}
                  type="button"
                  aria-label={label}
                  className="button-secondary min-h-11 min-w-11 p-3"
                  onClick={() => move(x, y)}
                >
                  <Icon size={18} aria-hidden="true" />
                </button>
              ))}
            </div>
          </fieldset>
        </>
      )}
      <fieldset disabled={!image || busy} className="space-y-3">
        <legend className="sr-only">확대와 조명 조절</legend>
        {controls.map((control) => (
          <div key={control.key} className="space-y-1">
            <label
              htmlFor={`${id}-${control.key}`}
              className="flex flex-wrap justify-between gap-2 text-sm font-medium"
            >
              <span>{control.label}</span>
              <span className="tabular-nums">
                {control.key === "scale" ? `${state.scale.toFixed(2)}배` : `${state[control.key]}%`}
              </span>
            </label>
            <input
              ref={control.key === "scale" ? zoom : undefined}
              id={`${id}-${control.key}`}
              type="range"
              min={control.min}
              max={control.max}
              step={control.step}
              value={state[control.key]}
              className="h-11 w-full accent-primary-700"
              aria-valuetext={
                control.key === "scale" ? `${state.scale.toFixed(2)}배` : `${state[control.key]}%`
              }
              onChange={(event) => {
                if (!image) return;
                change(
                  control.key === "scale"
                    ? zoomAdjustment(
                        image.width,
                        image.height,
                        latest.current,
                        event.currentTarget.valueAsNumber,
                      )
                    : { ...latest.current, [control.key]: event.currentTarget.valueAsNumber },
                );
              }}
            />
          </div>
        ))}
      </fieldset>
      <p className="text-xs leading-relaxed text-neutral-600">
        밝기·대비는 필요한 만큼만 조절해 주세요. 사진의 색감과 질감이 달라질 수 있어요.
      </p>
      {(loadError?.file === file || error) && (
        <p
          role="alert"
          className="rounded-xl bg-status-danger-surface p-3 text-sm text-status-danger"
        >
          {loadError?.file === file ? loadError.text : error}
        </p>
      )}
      <button
        type="button"
        className="button-secondary w-full"
        disabled={!image || busy}
        onClick={() => change({ ...defaultAdjustment })}
      >
        초기화
      </button>
      <button
        type="button"
        className="button-primary flex w-full items-center justify-center gap-2"
        disabled={!image || busy}
        onClick={() => void confirm()}
      >
        {submitting && (
          <LoaderCircle aria-hidden="true" size={18} className="motion-safe:animate-spin" />
        )}
        {submitting
          ? "보정한 사진을 준비하고 있어요…"
          : previewOnly
            ? "보정한 사진 미리보기"
            : "보정 완료 및 사진 확정"}
      </button>
      <button
        type="button"
        className="button-secondary w-full"
        disabled={submitting}
        onClick={onChooseAnother}
      >
        다른 사진 선택하기
      </button>
      {warning && (
        <QualityWarningModal
          reason={warning}
          retryLabel="사진 다시 보정하기"
          onRetry={dismiss}
          onDismiss={dismiss}
        />
      )}
    </section>
  );
}
