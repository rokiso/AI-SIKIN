"use client";
import { useEffect, useRef, useState } from "react";
import { Award, X } from "lucide-react";
import { milestoneDetailResponse, type MilestoneDetail } from "@/lib/snapshot/milestone-types";
import { snapshotRequest } from "@/lib/snapshot/client";
const labels = { LOW: "낮음", BALANCED: "균형", HIGH: "높음" };
const barWidth = { LOW: "w-1/3", BALANCED: "w-2/3", HIGH: "w-full" };
function ComparisonPhoto({
  photo,
  label,
}: {
  photo: MilestoneDetail["snapshots"]["start"];
  label: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <figure className="min-w-0 space-y-2">
      <figcaption className="text-sm font-semibold">
        {label}
        <span className="mt-1 block text-xs font-normal text-neutral-600">{photo.recordDate}</span>
      </figcaption>
      {failed ? (
        <p role="status" className="rounded-xl bg-surface-muted p-3 text-sm">
          사진 링크가 만료됐거나 사진을 불러오지 못했어요. 아래에서 다시 불러와주세요.
        </p>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- Private short-lived signed photos must not pass through the image optimizer.
        <img
          src={photo.viewUrl}
          alt={`${label} 피부 기록 사진`}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="aspect-square w-full rounded-xl bg-surface-muted object-contain"
        />
      )}
    </figure>
  );
}
export function MilestoneCelebrationModal({ id, close }: { id: string; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<MilestoneDetail | null>(null),
    [error, setError] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const origin = document.activeElement,
      node = dialog.current;
    node?.showModal();
    return () => {
      node?.close();
      if (origin instanceof HTMLElement && origin.isConnected) origin.focus();
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function load() {
      setData(null);
      setError(false);
      try {
        const result = milestoneDetailResponse.parse(
          await snapshotRequest(`/api/v1/snapshots/milestones/${id}`, controller.signal),
        );
        if (result.data.id !== id) throw new Error("Unexpected milestone");
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
  }, [id, revision]);
  return (
    <dialog
      ref={dialog}
      aria-labelledby="milestone-title"
      onCancel={close}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl bg-surface p-4 text-neutral-900 backdrop:bg-neutral-900/50 sm:p-6"
    >
      <div className="flex items-start justify-between gap-2">
        <h2 id="milestone-title" className="text-lg font-semibold">
          {data ? `${data.achievedStreakDays}일 연속 기록 달성!` : "연속 기록 리포트"}
        </h2>
        <button
          type="button"
          className="icon-button shrink-0"
          aria-label="리포트 닫기"
          onClick={close}
        >
          <X size={22} strokeWidth={1.75} />
        </button>
      </div>
      {error ? (
        <div role="alert" className="mt-4 space-y-3">
          <p className="text-sm">
            마일스톤 리포트를 불러오지 못했습니다. 로그인과 네트워크 상태를 확인한 후 다시
            시도해주세요.
          </p>
          <button className="button-secondary w-full" onClick={() => setRevision((v) => v + 1)}>
            다시 시도
          </button>
        </div>
      ) : !data ? (
        <div role="status" className="mt-4 space-y-3">
          <div
            aria-hidden="true"
            className="h-32 rounded-xl bg-neutral-100 motion-safe:animate-pulse"
          />
          <p>리포트를 불러오고 있어요.</p>
        </div>
      ) : (
        <div className="mt-4 space-y-5 break-keep">
          <div className="space-y-3 rounded-xl bg-primary-50 p-4">
            <Award aria-hidden="true" size={28} strokeWidth={1.75} className="text-primary-700" />
            <p className="font-semibold text-primary-800">{data.achievedStreakDays}일 달성 배지</p>
            <p className="text-sm leading-relaxed">{data.summaryComment}</p>
          </div>
          <h3 className="font-semibold">시작일과 달성일 비교</h3>
          <div className="grid grid-cols-2 gap-3" key={revision}>
            <ComparisonPhoto photo={data.snapshots.start} label="시작일" />
            <ComparisonPhoto photo={data.snapshots.achieved} label="달성일" />
          </div>
          <button className="button-secondary w-full" onClick={() => setRevision((v) => v + 1)}>
            사진·리포트 다시 불러오기
          </button>
          <p className="text-xs leading-relaxed text-neutral-600">
            사진 외관에 대한 AI 참고 분류입니다. 실제 수분 측정값이나 피부 장벽 개선의 근거가 아니며
            조명·촬영 환경에 따라 달라질 수 있어요.
          </p>
          {(
            [
              { key: "hydration", label: "보습" },
              { key: "soothing", label: "진정" },
              { key: "sebum", label: "유분" },
            ] as const
          ).map(({ key, label }) => {
            const values = data.comparison[key];
            return (
              <section
                key={key}
                aria-label={`${label} 참고 분류 비교`}
                className="space-y-2 rounded-xl border border-neutral-200 p-3"
              >
                <h4 className="text-sm font-semibold">{label}</h4>
                {[
                  { name: "시작일", value: values.initial },
                  { name: "달성일", value: values.current },
                ].map(({ name, value }) => (
                  <div key={name} className="space-y-1 text-xs">
                    <p>
                      {name} · {value ? labels[value] : "비교 자료 없음"}
                    </p>
                    <div aria-hidden="true" className="h-2 overflow-hidden rounded bg-neutral-100">
                      {value && <div className={`h-full bg-primary-600 ${barWidth[value]}`} />}
                    </div>
                  </div>
                ))}
                {(values.initial === null || values.current === null) && (
                  <p className="text-xs text-neutral-600">
                    AI 참고 분류가 없는 기록은 상태 변화를 비교하지 않습니다.
                  </p>
                )}
              </section>
            );
          })}
          <p className="text-xs leading-relaxed text-neutral-600">
            이 리포트는 일상 스킨케어 기록 안내이며 의료 진단이나 치료를 대신하지 않습니다.
          </p>
        </div>
      )}
    </dialog>
  );
}
