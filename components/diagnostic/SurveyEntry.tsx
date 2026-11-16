"use client";
import { useState } from "react";
import { BaumannQuestionnaire } from "./BaumannQuestionnaire";
export function SurveyEntry() {
  const [started, setStarted] = useState(false);
  return (
    <div className="mt-6">
      {started ? (
        <BaumannQuestionnaire />
      ) : (
        <section className="space-y-3 rounded-2xl border border-neutral-200 bg-surface p-5">
          <h2 className="text-lg font-semibold text-neutral-900">
            사진 없이 피부 습관부터 살펴볼까요?
          </h2>
          <p className="text-sm leading-relaxed text-neutral-600">
            12문항에 답하고 약식 자가문진 결과를 확인해요. 사진은 전송하지 않으며, 문진 답변은
            완료할 때 저장됩니다.
          </p>
          <button type="button" className="button-primary w-full" onClick={() => setStarted(true)}>
            문진 먼저 시작하기
          </button>
        </section>
      )}
    </div>
  );
}
