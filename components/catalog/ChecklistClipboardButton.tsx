"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { formatChecklist } from "@/lib/catalog/procedures";

export function ChecklistClipboardButton({
  questions,
  copyText,
  variant = "checklist",
}: {
  questions: string[];
  copyText?: string;
  variant?: "checklist" | "defense";
}) {
  const [status, setStatus] = useState<"idle" | "busy" | "copied" | "fallback">("idle");
  const lock = useRef(false);
  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const notice = useRef<HTMLParagraphElement>(null);
  const text = copyText ?? formatChecklist(questions);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  useEffect(() => {
    if (status === "fallback") {
      field.current?.focus();
      field.current?.select();
    }
    if (status === "copied") notice.current?.scrollIntoView?.({ block: "nearest" });
  }, [status]);
  async function copy() {
    if (lock.current) return;
    lock.current = true;
    if (timer.current) clearTimeout(timer.current);
    setStatus("busy");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
      if (mounted.current) {
        setStatus("copied");
        timer.current = setTimeout(() => setStatus("idle"), variant === "defense" ? 3000 : 2000);
      }
    } catch {
      if (mounted.current) setStatus("fallback");
    } finally {
      lock.current = false;
    }
  }
  return (
    <div className="space-y-3">
      <button
        className="button-primary w-full gap-2"
        type="button"
        disabled={status === "busy"}
        onClick={copy}
      >
        {status === "copied" ? (
          <Check size={18} strokeWidth={1.75} aria-hidden="true" />
        ) : (
          <Copy size={18} strokeWidth={1.75} aria-hidden="true" />
        )}
        {status === "copied"
          ? "복사 완료"
          : status === "busy"
            ? "복사 중…"
            : variant === "defense"
              ? "상담 질문지 복사하기"
              : "상담 체크리스트 복사"}
      </button>
      <p ref={notice} role="status" className="scroll-mb-4 text-sm text-neutral-700">
        {status === "copied"
          ? variant === "defense"
            ? "상담 체크리스트가 복사되었습니다."
            : "상담 체크리스트 3문항이 복사되었습니다."
          : status === "fallback"
            ? "자동 복사를 사용할 수 없습니다. 아래 질문을 길게 누르거나 선택해 직접 복사해 주세요."
            : ""}
      </p>
      {status === "fallback" && (
        <label className="block space-y-2 text-sm font-medium text-neutral-800">
          <span>직접 복사할 상담 질문</span>
          <textarea
            ref={field}
            readOnly
            value={text}
            rows={8}
            className="w-full rounded-xl border border-neutral-300 bg-surface p-3 text-sm leading-relaxed"
          />
        </label>
      )}
    </div>
  );
}
