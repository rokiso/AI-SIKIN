"use client";
import { useEffect, useState } from "react";
import { Award } from "lucide-react";
import {
  milestoneListResponse,
  streakResponseSchema,
  type StreakData,
  type MilestoneSummary,
} from "@/lib/snapshot/milestone-types";
import { snapshotRequest } from "@/lib/snapshot/client";
import { MilestoneCelebrationModal } from "./MilestoneCelebrationModal";
export function StreakBadge({
  refreshKey,
  celebration,
}: {
  refreshKey?: string;
  celebration?: MilestoneSummary | null;
}) {
  const [data, setData] = useState<StreakData | null>(null),
    [error, setError] = useState(false),
    [revision, setRevision] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null),
    [history, setHistory] = useState(false);
  const [reports, setReports] = useState<MilestoneSummary[]>([]),
    [nextCursor, setNextCursor] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState(false),
    [historyBusy, setHistoryBusy] = useState(false),
    [cursor, setCursor] = useState<string | null>(null),
    [historyRevision, setHistoryRevision] = useState(0);
  const [dismissedCelebration, setDismissedCelebration] = useState<string | null>(null);
  const activeId =
    openId ?? (celebration && celebration.id !== dismissedCelebration ? celebration.id : null);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function load() {
      setData(null);
      setError(false);
      try {
        const result = streakResponseSchema.parse(
          await snapshotRequest("/api/v1/snapshots/streak", controller.signal),
        );
        if (active) setData(result.data);
      } catch {
        if (active) setError(true);
      }
    }
    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [refreshKey, revision]);
  useEffect(() => {
    if (!history) return;
    const controller = new AbortController();
    let active = true;
    async function load() {
      setHistoryBusy(true);
      setHistoryError(false);
      try {
        const result = milestoneListResponse.parse(
          await snapshotRequest(
            `/api/v1/snapshots/milestones${cursor ? `?cursor=${cursor}` : ""}`,
            controller.signal,
          ),
        );
        if (active) {
          setReports((previous) =>
            cursor
              ? [
                  ...previous,
                  ...result.data.reports.filter(
                    (row) => !previous.some((old) => old.id === row.id),
                  ),
                ]
              : result.data.reports,
          );
          setNextCursor(result.data.nextCursor);
        }
      } catch {
        if (active) setHistoryError(true);
      } finally {
        if (active) setHistoryBusy(false);
      }
    }
    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [history, cursor, historyRevision, refreshKey]);
  return (
    <section
      aria-label="연속 기록과 달성 리포트"
      className="space-y-3 rounded-2xl border border-primary-100 bg-primary-50 p-4 break-keep"
    >
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <Award size={22} strokeWidth={1.75} aria-hidden="true" className="text-primary-700" />
        꾸준히 쌓은 나의 기록
      </h2>
      {error ? (
        <div role="alert" className="space-y-3">
          <p className="text-sm">
            연속 기록을 불러오지 못했습니다. 로그인과 네트워크 상태를 확인해주세요.
          </p>
          <button className="button-secondary w-full" onClick={() => setRevision((v) => v + 1)}>
            연속 기록 다시 시도
          </button>
        </div>
      ) : !data ? (
        <p role="status" className="text-sm motion-safe:animate-pulse">
          연속 기록을 불러오고 있어요.
        </p>
      ) : (
        <>
          <p role="status" className="font-semibold text-primary-800">
            현재 {data.currentStreak}일 연속 기록 중 · 최장 {data.longestStreak}일
          </p>
          {data.nextMilestone && (
            <p className="text-sm leading-relaxed">
              {data.nextMilestone.targetStreak}일 연속 기록까지 {data.nextMilestone.remainingDays}일
              남았어요.{" "}
              {data.todayRecorded
                ? "내일도 피부 스냅샷을 남겨보세요."
                : "오늘의 피부 스냅샷을 남겨보세요."}
            </p>
          )}
          {data.latestMilestoneReport && (
            <button
              type="button"
              className="button-secondary w-full"
              onClick={() => {
                if (data.latestMilestoneReport) setOpenId(data.latestMilestoneReport.id);
              }}
            >
              {data.latestMilestoneReport.achievedStreakDays}일 달성 리포트 보기
            </button>
          )}
        </>
      )}
      <button
        type="button"
        className="button-secondary w-full"
        aria-expanded={history}
        onClick={() => {
          setHistory(!history);
          setCursor(null);
        }}
      >
        연속 기록 리포트 보관함
      </button>
      {history && (
        <div role="group" aria-label="달성 리포트 목록" className="space-y-3">
          {reports.map((row) => (
            <button
              type="button"
              key={row.id}
              className="button-secondary w-full justify-between gap-2 text-left"
              onClick={() => setOpenId(row.id)}
            >
              <span>{row.achievedStreakDays}일 달성</span>
              <span className="text-xs">{row.achievedDate}</span>
            </button>
          ))}
          {historyBusy ? (
            <p role="status" className="text-sm">
              달성 리포트를 불러오고 있어요.
            </p>
          ) : historyError ? (
            <div role="alert" className="space-y-2 text-sm">
              <p>달성 리포트 목록을 불러오지 못했습니다.</p>
              <button
                className="button-secondary w-full"
                onClick={() => setHistoryRevision((v) => v + 1)}
              >
                목록 다시 시도
              </button>
            </div>
          ) : reports.length === 0 ? (
            <p className="text-sm">아직 달성 리포트가 없어요. 3일 연속 기록부터 시작해 보세요.</p>
          ) : (
            nextCursor && (
              <button className="button-secondary w-full" onClick={() => setCursor(nextCursor)}>
                이전 달성 리포트 더 보기
              </button>
            )
          )}
        </div>
      )}
      {activeId && (
        <MilestoneCelebrationModal
          key={activeId}
          id={activeId}
          close={() => {
            setOpenId(null);
            setDismissedCelebration(celebration?.id ?? null);
          }}
        />
      )}
    </section>
  );
}
