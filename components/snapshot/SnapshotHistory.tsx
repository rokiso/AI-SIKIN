"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { monthlyResponseSchema, type MonthlySnapshotData } from "@/lib/snapshot/calendar";
import { SnapshotCalendarGrid } from "./SnapshotCalendarGrid";
import { SnapshotTimelineView } from "./SnapshotTimelineView";
import { SocialAuthModal } from "@/components/auth/SocialAuthModal";
export function SnapshotHistory({
  initialMonth,
  refreshKey = "",
}: {
  initialMonth: string;
  refreshKey?: string;
}) {
  const [month, setMonth] = useState(initialMonth);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<MonthlySnapshotData | null>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [login, setLogin] = useState(false);
  const mounted = useRef(true);
  const [year, monthNumber] = month.split("-").map(Number);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function load() {
      setBusy(true);
      setData(null);
      setError("");
      setLogin(false);
      try {
        const response = await fetch(
          `/api/v1/snapshots/monthly?year=${year}&month=${monthNumber}`,
          {
            cache: "no-store",
            credentials: "same-origin",
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
          },
        );
        if (response.status === 401) {
          if (active) setLogin(true);
          return;
        }
        const parsed = monthlyResponseSchema.safeParse(await response.json());
        if (
          !response.ok ||
          !parsed.success ||
          parsed.data.data.year !== year ||
          parsed.data.data.month !== monthNumber
        )
          throw new Error("Monthly query failed");
        if (!active || !mounted.current) return;
        const next = parsed.data.data;
        setData(next);
        setSelectedDate((previous) =>
          previous.startsWith(month)
            ? previous
            : (next.snapshots.at(-1)?.recordDate ??
              (next.today.startsWith(month) ? next.today : `${month}-01`)),
        );
      } catch {
        if (active) setError("스냅샷 기록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
      } finally {
        if (active) setBusy(false);
      }
    }
    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [year, monthNumber, month, revision, refreshKey]);
  function selectDate(date: string) {
    setSelectedDate(date);
    requestAnimationFrame(() => document.getElementById("snapshot-detail-heading")?.focus());
  }
  function move(delta: number) {
    const next = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
    setMonth(next.toISOString().slice(0, 7));
  }
  return (
    <section aria-labelledby="snapshot-history-heading" className="space-y-5 break-keep">
      <h2 id="snapshot-history-heading" className="text-lg font-semibold text-neutral-900">
        피부 기록 캘린더
      </h2>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className="icon-button"
          aria-label="이전 달"
          disabled={year <= 1900 && monthNumber === 1}
          onClick={() => move(-1)}
        >
          <ChevronLeft aria-hidden="true" size={22} strokeWidth={1.75} />
        </button>
        <p className="text-base font-semibold text-neutral-900">
          {year}년 {monthNumber}월
        </p>
        <button
          type="button"
          className="icon-button"
          aria-label="다음 달"
          disabled={year >= 9998 && monthNumber === 12}
          onClick={() => move(1)}
        >
          <ChevronRight aria-hidden="true" size={22} strokeWidth={1.75} />
        </button>
      </div>
      {busy ? (
        <div
          role="status"
          aria-label="월별 기록 불러오는 중"
          className="space-y-4 motion-safe:animate-pulse"
        >
          <div className="grid grid-cols-7 gap-1" aria-hidden="true">
            {Array.from({ length: 35 }, (_, i) => (
              <span key={i} className="h-12 rounded bg-neutral-100" />
            ))}
          </div>
          <div className="h-24 rounded-xl bg-neutral-100" aria-hidden="true" />
          <p className="text-sm text-neutral-600">기록을 불러오고 있어요.</p>
        </div>
      ) : login ? (
        <div role="status" className="space-y-3 rounded-2xl bg-primary-50 p-4">
          <p>데일리 피부 기록은 로그인 후 이용할 수 있습니다.</p>
          <SocialAuthModal />
        </div>
      ) : error ? (
        <div
          role="alert"
          className="space-y-3 rounded-2xl bg-status-warning-surface p-4 text-sm text-status-warning"
        >
          <p>{error}</p>
          <button
            type="button"
            className="button-secondary w-full"
            onClick={() => setRevision((value) => value + 1)}
          >
            다시 시도
          </button>
        </div>
      ) : (
        data && (
          <>
            <p role="status" className="text-sm text-primary-800">
              이번 달 {data.totalRecordedDays}일 기록 · 현재 {data.currentStreakDays}일 연속
            </p>
            <SnapshotCalendarGrid
              year={year}
              month={monthNumber}
              snapshots={data.snapshots}
              selectedDate={selectedDate}
              today={data.today}
              onSelect={selectDate}
            />
            {data.totalRecordedDays === 0 ? (
              <div className="space-y-3 rounded-2xl bg-surface-muted p-4">
                <p className="text-sm leading-relaxed text-neutral-700">
                  이번 달에 기록된 피부 스냅샷이 없습니다. 오늘의 피부 사진을 첫 번째로 남겨보세요!
                </p>
                <Link href="/snapshot#snapshot-recording" className="button-primary w-full">
                  오늘 스냅샷 기록하기
                </Link>
              </div>
            ) : (
              <>
                <SnapshotTimelineView
                  selectedDate={selectedDate}
                  snapshot={data.snapshots.find((item) => item.recordDate === selectedDate)}
                  onRefresh={() => setRevision((value) => value + 1)}
                />
                <ul aria-label="이번 달 기록 목록" className="space-y-2">
                  {data.snapshots.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className="button-secondary w-full justify-between text-left"
                        aria-pressed={item.recordDate === selectedDate}
                        onClick={() => selectDate(item.recordDate)}
                      >
                        <span>{item.recordDate}</span>
                        <span>{item.feedbackSource === "AI" ? "참고 피드백" : "일반 안내"}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {!data.todayRecorded && data.totalRecordedDays > 0 && (
              <Link href="/snapshot#snapshot-recording" className="button-primary w-full">
                오늘의 피부 기록 남기기
              </Link>
            )}
          </>
        )
      )}
    </section>
  );
}
