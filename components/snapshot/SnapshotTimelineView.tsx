"use client";
import { useState } from "react";
import type { MonthlySnapshot } from "@/lib/snapshot/calendar";
const levels = { LOW: "낮음", BALANCED: "균형", HIGH: "높음" };
export function SnapshotImage({
  snapshot,
  compact = false,
}: {
  snapshot: MonthlySnapshot;
  compact?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <span className="text-xs text-neutral-600">
        {compact ? "기록" : "사진을 불러오지 못했어요. 아래 버튼으로 기록을 새로 불러와 주세요."}
      </span>
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element -- Private signed URLs must bypass shared image optimization caches.
    <img
      src={snapshot.thumbnailUrl}
      alt={compact ? "" : `${snapshot.recordDate} 피부 기록 사진`}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setFailed(true)}
      className={
        compact
          ? "mx-auto h-6 w-6 rounded object-cover"
          : "max-h-80 w-full rounded-xl bg-surface-muted object-contain"
      }
    />
  );
}
export function SnapshotTimelineView({
  snapshot,
  selectedDate,
  onRefresh,
}: {
  snapshot?: MonthlySnapshot;
  selectedDate: string;
  onRefresh: () => void;
}) {
  return (
    <section
      aria-labelledby="snapshot-detail-heading"
      className="space-y-4 rounded-2xl border border-neutral-200 bg-surface p-4"
    >
      <h3
        id="snapshot-detail-heading"
        tabIndex={-1}
        className="text-base font-semibold text-neutral-900"
      >
        {selectedDate} 피부 기록
      </h3>
      {!snapshot ? (
        <p className="text-sm text-neutral-600">이 날짜에는 기록이 없습니다.</p>
      ) : (
        <>
          <SnapshotImage key={snapshot.thumbnailUrl} snapshot={snapshot} />
          <p className="text-sm font-semibold text-primary-800">
            {snapshot.feedbackSource === "AI" ? "사진 기반 참고 피드백" : "일반 관리 안내"}
          </p>
          <p className="text-sm leading-relaxed text-neutral-700">{snapshot.feedbackComment}</p>
          {snapshot.conditions ? (
            <ul className="flex flex-wrap gap-2 text-xs text-primary-800">
              <li className="rounded-xl bg-primary-50 px-3 py-2">
                수분 {levels[snapshot.conditions.hydrationLevel]}
              </li>
              <li className="rounded-xl bg-primary-50 px-3 py-2">
                진정 {levels[snapshot.conditions.soothingLevel]}
              </li>
              <li className="rounded-xl bg-primary-50 px-3 py-2">
                피지 {levels[snapshot.conditions.sebumLevel]}
              </li>
            </ul>
          ) : (
            <p className="text-xs leading-relaxed text-neutral-600">
              AI 측정값이 없는 기록입니다. 수분·진정·피지 등급은 표시하지 않습니다.
            </p>
          )}
          <button type="button" className="button-secondary w-full" onClick={onRefresh}>
            사진과 기록 새로 불러오기
          </button>
          <p className="text-xs leading-relaxed text-neutral-600">
            사진 링크는 5분 동안 유효해요. 사진이 보이지 않으면 다시 불러와 주세요.
          </p>
        </>
      )}
    </section>
  );
}
