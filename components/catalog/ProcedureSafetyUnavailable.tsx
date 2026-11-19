"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { safetyFailureMessage } from "@/lib/catalog/procedure-safety-types";
export function ProcedureSafetyUnavailable({
  empty = false,
  message,
  onRetry,
}: {
  empty?: boolean;
  message?: string;
  onRetry?: () => void;
}) {
  const router = useRouter();
  return (
    <section
      className="space-y-4 rounded-2xl bg-surface-muted p-5"
      role={empty ? "status" : "alert"}
    >
      <h1 className="text-lg font-semibold">
        {empty ? "상세 가이드 준비 중" : "시술 정보를 확인할 수 없어요"}
      </h1>
      <p className="text-sm leading-relaxed text-neutral-700">
        {empty
          ? "현재 해당 시술의 상세 가이드를 준비 중입니다."
          : (message ?? safetyFailureMessage)}
      </p>
      {!empty && (
        <button
          type="button"
          className="button-secondary w-full"
          onClick={onRetry ?? (() => router.refresh())}
        >
          다시 시도
        </button>
      )}
      <Link href="/catalog/procedures" className="button-primary w-full">
        {empty ? "다른 시술 가이드 보기" : "시술 목록으로 돌아가기"}
      </Link>
    </section>
  );
}
