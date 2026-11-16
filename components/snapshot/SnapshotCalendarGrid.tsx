"use client";
import { calendarCells, type MonthlySnapshot } from "@/lib/snapshot/calendar";
import { SnapshotImage } from "./SnapshotTimelineView";
export function SnapshotCalendarGrid({
  year,
  month,
  snapshots,
  selectedDate,
  today,
  onSelect,
}: {
  year: number;
  month: number;
  snapshots: MonthlySnapshot[];
  selectedDate: string;
  today: string;
  onSelect: (date: string) => void;
}) {
  const byDate = new Map(snapshots.map((item) => [item.recordDate, item]));
  return (
    <div className="-mx-4" role="group" aria-label={`${year}년 ${month}월 피부 기록 달력`}>
      <div className="grid grid-cols-7 text-center text-xs text-neutral-600" aria-hidden="true">
        {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
          <span className="py-2" key={day}>
            {day}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {calendarCells(year, month).map((date, index) => {
          if (!date) return <span key={`blank-${index}`} aria-hidden="true" />;
          const snapshot = byDate.get(date);
          return (
            <button
              type="button"
              key={date}
              aria-label={`${date}${date === today ? " 오늘" : ""} ${snapshot ? "기록 있음" : "기록 없음"}`}
              aria-pressed={date === selectedDate}
              onClick={() => onSelect(date)}
              className={`flex min-h-24 min-w-0 flex-col items-center justify-start gap-1 border border-neutral-100 py-2 text-xs ${date === selectedDate ? "bg-primary-100 font-semibold text-primary-900 ring-2 ring-inset ring-primary-700" : date === today ? "bg-primary-50 text-primary-800" : "bg-surface text-neutral-700"}`}
            >
              <span>{Number(date.slice(-2))}</span>
              {snapshot ? (
                <SnapshotImage key={snapshot.thumbnailUrl} snapshot={snapshot} compact />
              ) : (
                <span aria-hidden="true" className="text-neutral-400">
                  ·
                </span>
              )}
              {snapshot?.conditions && (
                <span className="text-xs leading-tight">
                  수분{" "}
                  {snapshot.conditions.hydrationLevel === "LOW"
                    ? "낮음"
                    : snapshot.conditions.hydrationLevel === "HIGH"
                      ? "높음"
                      : "균형"}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
