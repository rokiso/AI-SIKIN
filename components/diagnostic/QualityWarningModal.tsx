"use client";
import { useEffect, useId, useRef } from "react";
import type { QualityFailureReason } from "@/lib/image/faceQualityValidator";

const guidance = {
  FACE_NOT_FOUND: {
    title: "얼굴을 찾을 수 없어요",
    description: "얼굴 전체가 가이드 안에 오도록 정면에서 찍은 사진을 사용해 주세요.",
  },
  LOW_LIGHT: {
    title: "주변이 너무 어두워요",
    description: "밝은 곳으로 이동해 얼굴에 빛이 고르게 닿도록 해 주세요.",
  },
  BLURRY: {
    title: "초점이 흔들렸어요",
    description: "카메라를 양손으로 고정하고 얼굴에 초점이 맞은 뒤 촬영해 주세요.",
  },
} satisfies Record<QualityFailureReason, { title: string; description: string }>;

export function QualityWarningModal({
  reason,
  onRetry,
  onDismiss,
  onAlbum,
}: {
  reason: QualityFailureReason;
  onRetry: () => void;
  onDismiss: () => void;
  onAlbum?: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  function action(fn: () => void) {
    ref.current?.close();
    fn();
  }
  return (
    <dialog
      ref={ref}
      aria-modal="true"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-sm space-y-4 overflow-y-auto break-keep rounded-2xl border border-neutral-200 bg-surface p-5 text-neutral-900 backdrop:bg-neutral-900/40 [overflow-wrap:break-word]"
      onCancel={(event) => {
        event.preventDefault();
        action(onDismiss);
      }}
    >
      <h3 id={`${id}-title`} className="text-lg font-semibold">
        {guidance[reason].title}
      </h3>
      <p id={`${id}-description`} className="text-sm leading-relaxed text-neutral-700">
        {guidance[reason].description}
      </p>
      <button
        autoFocus
        type="button"
        onClick={() => action(onRetry)}
        className="button-primary w-full"
      >
        {onAlbum ? "다시 촬영하기" : "다른 사진 선택하기"}
      </button>
      {onAlbum && (
        <button type="button" onClick={() => action(onAlbum)} className="button-secondary w-full">
          앨범에서 선택하기
        </button>
      )}
    </dialog>
  );
}
