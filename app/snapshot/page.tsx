import { CalendarDays } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeading } from "@/components/ui/PageHeading";

export default function SnapshotPage() {
  return (
    <div className="space-y-6 break-keep">
      <PageHeading eyebrow="데일리 기록" title="작은 변화를 한 장씩" description="그날의 피부 상태를 사진과 함께 남기고 돌아볼 수 있는 나만의 기록 공간이에요." />
      <section className="rounded-2xl border border-primary-100 bg-primary-50 p-5">
        <CalendarDays aria-hidden="true" strokeWidth={1.75} className="mb-3 h-6 w-6 text-primary-700" />
        <h2 className="text-base font-semibold text-neutral-900">기록은 로그인 후 저장할 수 있어요</h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-700">로그인과 스냅샷 기록 기능을 준비하고 있어요. 지금은 피부 진단 전 안내를 둘러볼 수 있어요.</p>
      </section>
      <EmptyState />
    </div>
  );
}
