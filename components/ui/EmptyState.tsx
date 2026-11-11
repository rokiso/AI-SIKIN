import Link from "next/link";
import { ArrowRight, ScanFace } from "lucide-react";

interface EmptyStateProps { title?: string; description?: string }

export function EmptyState({
  title = "아직 기록된 피부 분석 리포트가 없습니다.",
  description = "지금 3분 피부 진단을 받고 맞춤 케어 가이드를 확인해보세요.",
}: EmptyStateProps) {
  return (
    <section className="break-keep rounded-2xl border border-neutral-200 bg-surface px-5 py-8 text-center">
      <ScanFace aria-hidden="true" strokeWidth={1.75} className="mx-auto mb-4 h-8 w-8 text-primary-700" />
      <h2 className="text-lg font-semibold leading-relaxed text-neutral-900">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-neutral-600">{description}</p>
      <Link href="/diagnostic" className="button-primary mt-5">
        피부 진단 시작하기<ArrowRight aria-hidden="true" strokeWidth={1.75} className="h-4 w-4 shrink-0" />
      </Link>
    </section>
  );
}
