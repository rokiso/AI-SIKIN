"use client";
import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import type { SnapshotView } from "@/lib/snapshot/types";
const labels = { LOW: "낮음", BALANCED: "균형", HIGH: "높음" };
export function TodayFeedbackCard({
  snapshot,
  onRefresh,
}: {
  snapshot: SnapshotView;
  onRefresh: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const conditions = snapshot.conditions;
  return (
    <section
      aria-labelledby="snapshot-complete-heading"
      className="space-y-4 rounded-2xl border border-primary-100 bg-primary-50 p-5"
    >
      <div className="flex items-center gap-2 text-primary-800">
        <CheckCircle2 aria-hidden="true" size={22} />
        <h2 id="snapshot-complete-heading" className="text-lg font-semibold">
          오늘의 피부 스냅샷이 기록되었습니다
        </h2>
      </div>
      <p className="text-sm text-neutral-600">{snapshot.recordDate} · 한국 시간</p>
      {failed ? (
        <div role="alert" className="space-y-3 text-sm">
          <p>사진을 불러오지 못했어요. 관리 안내는 아래에서 확인할 수 있어요.</p>
          <button
            type="button"
            className="button-secondary w-full"
            onClick={() => {
              setFailed(false);
              onRefresh();
            }}
          >
            사진 다시 불러오기
          </button>
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- Private short-lived signed URLs must not pass through the image optimizer.
        <img
          src={snapshot.viewUrl}
          alt="오늘 기록한 피부 스냅샷"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="max-h-80 w-full rounded-xl bg-surface object-contain"
        />
      )}
      <h3 className="text-base font-semibold text-neutral-900">
        {snapshot.feedbackSource === "AI" ? "사진 기반 참고 피드백" : "오늘의 일반 관리 안내"}
      </h3>
      <p className="text-sm leading-relaxed text-neutral-700">{snapshot.feedbackComment}</p>
      {snapshot.feedbackSource === "AI" && (
        <p className="text-xs leading-relaxed text-neutral-600">
          사진의 외관에 대한 참고 분류이며 실제 피부 수분이나 건강의 측정값은 아닙니다.
        </p>
      )}
      {conditions ? (
        <dl className="grid grid-cols-3 gap-2 rounded-xl bg-surface p-3 text-center text-xs">
          {(
            [
              { key: "hydrationLevel", label: "보습" },
              { key: "soothingLevel", label: "진정" },
              { key: "sebumLevel", label: "유분" },
            ] as const
          ).map(({ key, label }) => (
            <div key={key}>
              <dt className="text-neutral-600">{label}</dt>
              <dd className="mt-2 font-semibold">{labels[conditions[key]]}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-xs leading-relaxed text-neutral-600">
          AI가 연결되지 않아 보습·진정·유분 상태를 판정하지 않았습니다.
        </p>
      )}
      <p role="status" className="text-sm font-medium text-primary-800">
        기록 완료! 내일 다시 기록할 수 있어요.
      </p>
    </section>
  );
}
