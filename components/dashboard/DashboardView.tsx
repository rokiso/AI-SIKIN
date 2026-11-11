import type { DashboardSummary } from "@/lib/dashboard/types";
import { DailySnapshotWidget } from "./DailySnapshotWidget";
import { DashboardHeroOnboarding } from "./DashboardHeroOnboarding";
import { QuickNavGrid } from "./QuickNavGrid";
import { SkinSummaryCard } from "./SkinSummaryCard";

export function DashboardView({ summary }: { summary: DashboardSummary }) {
  return (
    <div className="space-y-8 break-keep">
      {summary.hasDiagnosticHistory && summary.latestDiagnostic ? (
        <>
          <header>
            <p className="mb-3 text-sm font-semibold text-primary-700">{summary.user.nickname ? `${summary.user.nickname}님의 피부 관리` : "이어서 내 피부 살펴보기"}</p>
            <h1 className="text-2xl font-bold leading-snug tracking-tight text-neutral-900">오늘도, 내 피부에 맞게</h1>
            <p className="mt-3 text-sm leading-relaxed text-neutral-600">최근 분석을 기준으로 나에게 맞는 일상 관리를 살펴봐요.</p>
          </header>
          <SkinSummaryCard diagnostic={summary.latestDiagnostic} />
        </>
      ) : <DashboardHeroOnboarding />}
      {(summary.user.isAuthenticated || summary.hasDiagnosticHistory) && <DailySnapshotWidget snapshot={summary.todaySnapshot} isAuthenticated={summary.user.isAuthenticated} />}
      <QuickNavGrid />
    </div>
  );
}
