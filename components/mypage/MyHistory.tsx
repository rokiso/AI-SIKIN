"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { historyResponseSchema, type HistoryData, type HistoryReport } from "@/lib/mypage/types";
import { SnapshotImage } from "@/components/snapshot/SnapshotTimelineView";
import { SkinSummaryCard } from "@/components/dashboard/SkinSummaryCard";
import { MedicalDisclaimerNotice } from "@/components/layout/MedicalDisclaimerNotice";
import { SocialAuthModal } from "@/components/auth/SocialAuthModal";
const dateTime = (value: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
const levels = { LOW: "낮음", BALANCED: "균형", HIGH: "높음" };
function ReportDialog({ report, close }: { report: HistoryReport; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const origin = document.activeElement;
    const node = dialog.current;
    node?.showModal();
    return () => {
      node?.close();
      if (origin instanceof HTMLElement && origin.isConnected) origin.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-labelledby="history-report-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      className="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-[430px] space-y-4 overflow-y-auto rounded-2xl bg-surface p-4 text-neutral-900 backdrop:bg-neutral-900/40"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id="history-report-title" className="text-lg font-semibold">
          피부 분석 리포트 상세
        </h2>
        <button
          type="button"
          className="icon-button shrink-0"
          aria-label="리포트 상세 닫기"
          onClick={close}
        >
          <X aria-hidden="true" size={22} strokeWidth={1.75} />
        </button>
      </div>
      <SkinSummaryCard diagnostic={report} heading="저장된 피부 분석" showHistoryLink={false} />
      <MedicalDisclaimerNotice compact />
    </dialog>
  );
}
export function MyHistory() {
  const [tab, setTab] = useState<"diagnostics" | "snapshots">("diagnostics");
  const [data, setData] = useState<HistoryData | null>(null);
  const [busy, setBusy] = useState(true);
  const [moreBusy, setMoreBusy] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<HistoryReport | null>(null);
  const work = useRef<AbortController | null>(null);
  const loadLock = useRef(false);
  useEffect(() => () => work.current?.abort(), []);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    work.current?.abort();
    work.current = controller;
    async function load() {
      loadLock.current = false;
      setMoreBusy(false);
      setBusy(true);
      setData(null);
      setError("");
      setSelected(null);

      try {
        const response = await fetch(`/api/v1/users/me/history?tab=${tab}&limit=20`, {
          cache: "no-store",
          credentials: "same-origin",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
        });
        const parsed = historyResponseSchema.safeParse(await response.json());
        if (!response.ok || !parsed.success) throw new Error("History unavailable");
        if (!controller.signal.aborted) setData(parsed.data.data);
      } catch {
        if (!controller.signal.aborted)
          setError("이력 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [tab, revision]);
  async function more() {
    if (!data || loadLock.current || !data[tab].nextCursor) return;
    const cursor = data[tab].nextCursor;
    const controller = new AbortController();
    work.current = controller;
    loadLock.current = true;
    setMoreBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/v1/users/me/history?tab=${tab}&limit=20&cursor=${encodeURIComponent(cursor)}`,
        {
          cache: "no-store",
          credentials: "same-origin",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
        },
      );
      if (response.status === 401) {
        setData(null);
        setSelected(null);
        throw new Error("Session expired");
      }
      const parsed = historyResponseSchema.safeParse(await response.json());
      if (!response.ok || !parsed.success) throw new Error("History unavailable");
      if (controller.signal.aborted) return;
      const next = parsed.data.data;
      if (
        next.user.isAuthenticated !== data.user.isAuthenticated ||
        next.user.userId !== data.user.userId
      ) {
        setData(next);
        return;
      }
      setData({
        ...next,
        diagnostics:
          tab === "diagnostics"
            ? {
                ...next.diagnostics,
                items: [
                  ...data.diagnostics.items,
                  ...next.diagnostics.items.filter(
                    (item) => !data.diagnostics.items.some((old) => old.reportId === item.reportId),
                  ),
                ],
              }
            : data.diagnostics,
        snapshots:
          tab === "snapshots"
            ? {
                ...next.snapshots,
                items: [
                  ...data.snapshots.items,
                  ...next.snapshots.items.filter(
                    (item) =>
                      !data.snapshots.items.some((old) => old.snapshotId === item.snapshotId),
                  ),
                ],
              }
            : data.snapshots,
      });
    } catch {
      if (!controller.signal.aborted)
        setError("이전 기록을 불러오지 못했습니다. 다시 시도해 주세요.");
    } finally {
      if (!controller.signal.aborted) {
        loadLock.current = false;
        setMoreBusy(false);
      }
    }
  }
  return (
    <section className="space-y-5 break-keep" aria-label="내 피부 이력 보관함">
      <div role="tablist" aria-label="보관함 종류" className="grid grid-cols-2 gap-2">
        {(
          [
            ["diagnostics", "피부 진단 이력"],
            ["snapshots", "데일리 기록"],
          ] as const
        ).map(([value, label], index) => (
          <button
            key={value}
            ref={(node) => {
              tabs.current[index] = node;
            }}
            type="button"
            role="tab"
            id={`history-tab-${value}`}
            aria-selected={tab === value}
            aria-controls="mypage-history-panel"
            tabIndex={tab === value ? 0 : -1}
            className={tab === value ? "button-primary" : "button-secondary"}
            onClick={() => setTab(value)}
            onKeyDown={(event) => {
              if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
                event.preventDefault();
                const next =
                  event.key === "Home" ? 0 : event.key === "End" ? 1 : index === 0 ? 1 : 0;
                setTab(next === 0 ? "diagnostics" : "snapshots");
                tabs.current[next]?.focus();
              }
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id="mypage-history-panel"
        aria-labelledby={`history-tab-${tab}`}
        className="space-y-4"
      >
        {busy ? (
          <div role="status" className="space-y-3 motion-safe:animate-pulse">
            <p className="text-sm text-neutral-600">이력을 불러오고 있어요.</p>
            {[0, 1, 2].map((key) => (
              <div key={key} aria-hidden="true" className="h-24 rounded-2xl bg-neutral-100" />
            ))}
          </div>
        ) : (
          data && (
            <>
              {tab === "snapshots" && !data.user.isAuthenticated ? (
                <div className="space-y-3 rounded-2xl bg-primary-50 p-5">
                  <p className="text-sm text-neutral-700">
                    데일리 피부 기록은 로그인 후 이용할 수 있습니다.
                  </p>
                  <SocialAuthModal />
                </div>
              ) : data[tab].items.length === 0 ? (
                <div className="space-y-3 rounded-2xl border border-neutral-200 p-5 text-sm text-neutral-700">
                  <p>
                    {tab === "diagnostics"
                      ? "아직 완료된 피부 분석 리포트가 없습니다."
                      : "매일 피부를 기록하고 변화를 확인해보세요."}
                  </p>
                  {tab === "diagnostics" && (
                    <p className="text-xs leading-relaxed text-neutral-600">
                      문진 응답만 저장한 경우에는 완료된 분석 리포트가 생성되지 않습니다.
                    </p>
                  )}
                  <Link
                    href={tab === "diagnostics" ? "/diagnostic" : "/snapshot"}
                    className="button-primary w-full"
                  >
                    {tab === "diagnostics" ? "피부 분석 시작하기" : "오늘의 피부 기록하기"}
                  </Link>
                </div>
              ) : (
                <>
                  <p role="status" className="text-sm text-neutral-600">
                    전체 {data[tab].totalCount}개 중 {data[tab].items.length}개
                  </p>
                  {tab === "diagnostics" ? (
                    <ul className="space-y-3">
                      {data.diagnostics.items.map((report) => (
                        <li key={report.reportId}>
                          <button
                            type="button"
                            className="w-full space-y-3 rounded-2xl border border-neutral-200 bg-surface p-4 text-left"
                            onClick={() => setSelected(report)}
                          >
                            <time
                              className="text-xs text-neutral-600"
                              dateTime={report.diagnosedAt}
                            >
                              {dateTime(report.diagnosedAt)} · 한국 시간
                            </time>
                            <span className="block text-base font-semibold leading-relaxed text-primary-800">
                              {report.baumannNameKo}
                            </span>
                            <span className="block text-sm leading-relaxed text-neutral-700">
                              {report.summary || "저장된 피부 분석 결과를 확인해 보세요."}
                            </span>
                            <span className="grid grid-cols-2 gap-3">
                              {(
                                [
                                  ["oiliness", "유분"],
                                  ["sensitivity", "민감도"],
                                  ["pigmentation", "색소침착"],
                                  ["elasticity", "탄력·주름"],
                                ] as const
                              ).map(([key, label]) => (
                                <span key={key} className="text-xs text-neutral-700">
                                  <span className="flex justify-between gap-1">
                                    <span>{label}</span>
                                    <span>{report.axisScores[key]}</span>
                                  </span>
                                  <span
                                    aria-hidden="true"
                                    className="mt-1 block h-1 rounded-full bg-primary-100"
                                  >
                                    <span
                                      className="block h-full rounded-full bg-primary-700"
                                      style={{ width: `${report.axisScores[key]}%` }}
                                    />
                                  </span>
                                </span>
                              ))}
                            </span>
                            <span className="block text-sm font-semibold text-primary-700">
                              리포트 상세 보기
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <ul className="space-y-4">
                      {data.snapshots.items.map((item) => (
                        <li
                          key={item.snapshotId}
                          className="space-y-3 rounded-2xl border border-neutral-200 p-4"
                        >
                          <h3 className="text-base font-semibold text-neutral-900">
                            {item.recordDate} 피부 기록
                          </h3>
                          <SnapshotImage
                            key={item.thumbnailUrl}
                            snapshot={{ ...item, id: item.snapshotId }}
                          />
                          <p className="text-xs font-semibold text-primary-700">
                            {item.feedbackSource === "AI"
                              ? "사진 기반 참고 피드백"
                              : "일반 관리 안내"}
                          </p>
                          <p className="text-sm leading-relaxed text-neutral-700">
                            {item.feedbackComment}
                          </p>
                          {item.conditions ? (
                            <ul className="flex flex-wrap gap-2 text-xs text-neutral-700">
                              <li>수분 {levels[item.conditions.hydrationLevel]}</li>
                              <li>진정 {levels[item.conditions.soothingLevel]}</li>
                              <li>피지 {levels[item.conditions.sebumLevel]}</li>
                            </ul>
                          ) : (
                            <p className="text-xs text-neutral-600">
                              AI 측정값이 없는 일반 관리 안내입니다.
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {data[tab].nextCursor && (
                    <button
                      type="button"
                      className="button-secondary w-full"
                      disabled={moreBusy}
                      onClick={more}
                    >
                      {moreBusy ? "불러오는 중…" : "이전 기록 더 보기"}
                    </button>
                  )}
                  {tab === "snapshots" && (
                    <button
                      type="button"
                      className="button-secondary w-full"
                      onClick={() => setRevision((value) => value + 1)}
                    >
                      사진과 기록 새로 불러오기
                    </button>
                  )}
                </>
              )}
            </>
          )
        )}
        {error && (
          <div
            role="alert"
            className="space-y-3 rounded-2xl bg-status-warning-surface p-4 text-sm text-status-warning"
          >
            <p>{error}</p>
            <button
              type="button"
              className="button-secondary w-full"
              disabled={moreBusy}
              onClick={() => (data ? void more() : setRevision((value) => value + 1))}
            >
              다시 시도
            </button>
          </div>
        )}
      </div>
      {selected && <ReportDialog report={selected} close={() => setSelected(null)} />}
    </section>
  );
}
