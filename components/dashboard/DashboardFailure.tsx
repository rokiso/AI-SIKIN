"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, LoaderCircle } from "lucide-react";

export function DashboardFailure() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <section role="alert" className="space-y-4 break-keep rounded-2xl border border-neutral-200 bg-status-warning-surface p-5 text-status-warning">
      <CircleAlert aria-hidden="true" size={26} strokeWidth={1.75} />
      <h1 className="text-lg font-semibold leading-relaxed">대시보드 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</h1>
      <p className="text-sm leading-relaxed">연결 상태를 확인한 뒤 다시 불러와 주세요.</p>
      <button type="button" disabled={pending} onClick={() => startTransition(() => router.refresh())} className="button-secondary w-full">
        {pending && <LoaderCircle aria-hidden="true" size={18} strokeWidth={1.75} className="motion-safe:animate-spin" />}
        {pending ? "다시 불러오는 중" : "다시 시도"}
      </button>
      <p role="status" aria-live="polite" className="text-sm">{pending ? "대시보드 정보를 다시 불러오고 있어요." : ""}</p>
    </section>
  );
}
