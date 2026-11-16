"use client";
import { useEffect, useRef } from "react";
export function QualityWarningModal({
  onRetry,
  onProceed,
}: {
  onRetry: () => void;
  onProceed: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
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
      aria-labelledby="camera-quality-title"
      className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-sm space-y-4 overflow-y-auto rounded-2xl border border-neutral-200 bg-surface p-5 text-neutral-900 backdrop:bg-neutral-900/40"
      onCancel={(e) => {
        e.preventDefault();
        action(onProceed);
      }}
    >
      <h3 id="camera-quality-title" className="text-lg font-semibold">
        조명이 너무 어둡거나 화면이 흐릿합니다
      </h3>
      <p className="text-sm leading-relaxed text-neutral-700">
        밝은 조명이나 자연광을 정면으로 바라보고 다시 촬영해 보세요. 간이 화질 검사여서 피부톤이나
        주변 환경에 따라 다르게 안내될 수 있어요.
      </p>
      <button
        autoFocus
        type="button"
        onClick={() => action(onRetry)}
        className="button-primary w-full"
      >
        다시 촬영하기
      </button>
      <button type="button" onClick={() => action(onProceed)} className="button-secondary w-full">
        그대로 진행하기
      </button>
    </dialog>
  );
}
