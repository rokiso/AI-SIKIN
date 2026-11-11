import Link from "next/link";
import { ArrowRight, CalendarDays, Check } from "lucide-react";
import type { TodaySnapshot } from "@/lib/dashboard/types";

const levelLabels = { LOW: "낮음", BALANCED: "균형", HIGH: "높음" } as const;

export function DailySnapshotWidget({ snapshot, isAuthenticated }: { snapshot: TodaySnapshot; isAuthenticated: boolean }) {
  if (!isAuthenticated) {
    return (
      <aside className="space-y-3 break-keep rounded-2xl border border-neutral-200 p-5">
        <CalendarDays aria-hidden="true" size={22} strokeWidth={1.75} className="text-primary-700" />
        <h2 className="text-base font-semibold text-neutral-900">일상의 피부 변화도 기록해요</h2>
        <p className="text-sm leading-relaxed text-neutral-600">데일리 기록은 로그인 후 저장할 수 있어요. 마이페이지에서 로그인할 수 있으며, 스냅샷 기능은 준비하고 있어요.</p>
        <Link href="/snapshot" className="button-secondary flex justify-between">데일리 기록 안내<ArrowRight aria-hidden="true" size={18} strokeWidth={1.75} /></Link>
      </aside>
    );
  }
  return (
    <section aria-labelledby="today-snapshot-heading" className="space-y-4 break-keep rounded-2xl border border-neutral-200 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CalendarDays aria-hidden="true" size={22} strokeWidth={1.75} className="text-primary-700" />
        <p className="text-xs text-neutral-600">{snapshot.recordDate} · 한국 시간</p>
      </div>
      {snapshot.isRecorded ? (
        <>
          <h2 id="today-snapshot-heading" className="flex items-center gap-2 text-base font-semibold text-primary-800"><Check aria-hidden="true" size={20} strokeWidth={1.75} />오늘의 피부 기록 완료</h2>
          <p className="text-sm leading-relaxed text-neutral-700">{snapshot.feedbackComment || "오늘 기록의 피드백이 아직 등록되지 않았어요."}</p>
          <dl className="grid grid-cols-3 gap-2 rounded-xl bg-surface-muted p-3 text-center text-xs">
            <div><dt className="text-neutral-600">보습</dt><dd className="mt-2 font-semibold text-neutral-800">{levelLabels[snapshot.conditions.hydrationLevel]}</dd></div>
            <div><dt className="text-neutral-600">진정</dt><dd className="mt-2 font-semibold text-neutral-800">{levelLabels[snapshot.conditions.soothingLevel]}</dd></div>
            <div><dt className="text-neutral-600">유분</dt><dd className="mt-2 font-semibold text-neutral-800">{levelLabels[snapshot.conditions.sebumLevel]}</dd></div>
          </dl>
          <Link href="/snapshot" className="button-secondary flex justify-between">오늘 기록 확인하기<ArrowRight aria-hidden="true" size={18} strokeWidth={1.75} /></Link>
        </>
      ) : (
        <>
          <h2 id="today-snapshot-heading" className="text-base font-semibold leading-relaxed text-neutral-900">오늘의 피부 상태를 기록해보세요</h2>
          <p className="text-sm leading-relaxed text-neutral-600">하루의 기록이 내 피부 변화를 돌아보는 기준이 돼요.</p>
          <Link href="/snapshot" className="button-secondary flex w-full justify-between">오늘 스냅샷 남기기<ArrowRight aria-hidden="true" size={18} strokeWidth={1.75} /></Link>
          <p className="text-xs leading-relaxed text-neutral-600">스냅샷 저장 기능은 준비 중이며, 안내 화면으로 이동해요.</p>
        </>
      )}
    </section>
  );
}
