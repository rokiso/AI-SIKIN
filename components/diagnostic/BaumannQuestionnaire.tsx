"use client";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { z } from "zod";
import { axisLabels, baumannQuestions } from "@/lib/diagnostic/baumannData";

const resultSchema = z.object({
  sessionId: z.uuid(),
  status: z.literal("SURVEY_COMPLETED"),
  preliminaryType: z.string().regex(/^[OD][SR][PN][WT]$/),
  axisScores: z.object({
    oiliness: z.number(),
    sensitivity: z.number(),
    pigmentation: z.number(),
    elasticity: z.number(),
  }),
});
export type OnSurveyCompletePayload = z.infer<typeof resultSchema>;
export function BaumannQuestionnaire({
  uploadSessionId,
  onSurveyComplete,
}: {
  uploadSessionId?: string;
  onSurveyComplete?: (result: OnSurveyCompletePayload) => void;
}) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<OnSurveyCompletePayload | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controller = useRef<AbortController | null>(null);
  const locked = useRef(false);
  const requestId = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      controller.current?.abort();
    },
    [],
  );
  useEffect(() => {
    heading.current?.focus();
  }, [step, result]);
  const question = baumannQuestions[step];
  function cancelAdvance() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }
  function choose(choice: number) {
    if (locked.current) return;
    cancelAdvance();
    if (answers[question.id] !== choice) requestId.current = null;
    setAnswers((previous) => ({ ...previous, [question.id]: choice }));
    setError("");
    if (step < 11) timer.current = setTimeout(() => setStep((previous) => previous + 1), 300);
  }
  function navigate(next: number) {
    cancelAdvance();
    setStep(next);
    setError("");
  }
  function keyboard(event: KeyboardEvent<HTMLElement>) {
    if (busy || result || event.altKey || event.ctrlKey || event.metaKey) return;
    if (/^[1-4]$/.test(event.key)) {
      event.preventDefault();
      choose(Number(event.key));
    } else if (event.key === "ArrowLeft" && step > 0) {
      event.preventDefault();
      navigate(step - 1);
    } else if (event.key === "ArrowRight" && answers[question.id] && step < 11) {
      event.preventDefault();
      navigate(step + 1);
    }
  }
  async function submit() {
    if (locked.current) return;
    cancelAdvance();
    if (baumannQuestions.some((q) => !answers[q.id])) {
      setError("모든 문항에 답변해 주세요.");
      return;
    }
    locked.current = true;
    setBusy(true);
    setError("");
    requestId.current ??= crypto.randomUUID();
    const pending = new AbortController();
    controller.current = pending;
    const timeout = setTimeout(() => pending.abort(), 15_000);
    try {
      const response = await fetch("/api/v1/diagnostics/survey-answers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        signal: pending.signal,
        body: JSON.stringify({
          requestId: requestId.current,
          uploadSessionId: uploadSessionId ?? null,
          answers: baumannQuestions.map((q) => ({
            questionId: q.id,
            selectedChoice: answers[q.id],
          })),
        }),
      });
      const body: unknown = await response.json();
      const parsed = z.object({ success: z.literal(true), data: resultSchema }).safeParse(body);
      if (!response.ok || !parsed.success) {
        const failure = z.object({ error: z.object({ code: z.string() }) }).safeParse(body);
        if (failure.success && failure.data.error.code === "MISSING_SESSION_IDENTITY")
          setError("세션을 확인할 수 없습니다. 새로고침 후 다시 시작해 주세요.");
        else if (response.status === 429)
          setError("문진 저장 요청이 많습니다. 잠시 후 다시 시도해 주세요.");
        else setError("설문 응답을 저장하지 못했습니다. 다시 시도해 주세요.");
        return;
      }
      setResult(parsed.data.data);
      onSurveyComplete?.(parsed.data.data);
    } catch {
      setError("설문 응답을 저장하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      clearTimeout(timeout);
      controller.current = null;
      locked.current = false;
      setBusy(false);
    }
  }
  if (result)
    return (
      <section
        className="space-y-4 rounded-2xl border border-primary-200 bg-primary-50 p-5 break-keep"
        aria-labelledby="survey-heading"
      >
        <h2
          id="survey-heading"
          ref={heading}
          tabIndex={-1}
          className="text-xl font-semibold text-primary-800"
        >
          문진 응답을 저장했어요
        </h2>
        <p className="text-sm leading-relaxed text-neutral-700">
          내가 답한 피부 습관을 정리했어요. 사진 분석과 최종 리포트는 아직 연결되지 않았습니다.
        </p>
        <ul className="space-y-3 text-sm text-neutral-700">
          <li>유·수분: {result.axisScores.oiliness >= 50 ? "유분이 많은 편" : "건조한 편"}</li>
          <li>
            민감도: {result.axisScores.sensitivity >= 50 ? "민감한 편" : "민감 반응이 적은 편"}
          </li>
          <li>
            색소침착: {result.axisScores.pigmentation >= 50 ? "고민이 있는 편" : "고민이 적은 편"}
          </li>
          <li>
            탄력·주름:{" "}
            {result.axisScores.elasticity >= 50 ? "주름 고민이 있는 편" : "주름 고민이 적은 편"}
          </li>
        </ul>
        <p className="text-xs leading-relaxed text-neutral-600">
          바우만의 4개 축을 참고한 약식 자가문진으로, 공식 BSTI 검사나 의학적 진단을 대체하지
          않습니다. 복합성 등 세부 특성은 추가 확인이 필요합니다.
        </p>
      </section>
    );
  return (
    <section
      onKeyDown={keyboard}
      aria-labelledby="survey-heading"
      className="space-y-5 rounded-2xl border border-neutral-200 bg-surface p-5 break-keep [overflow-wrap:anywhere]"
    >
      <div>
        <p className="text-sm font-medium text-primary-700">
          {axisLabels[question.axis]} · {step + 1}/12
        </p>
        <progress
          className="mt-3 h-2 w-full accent-primary-700"
          aria-label="문진 진행률"
          value={step + 1}
          max={12}
        />
      </div>
      <h2
        id="survey-heading"
        ref={heading}
        tabIndex={-1}
        className="text-xl font-semibold leading-relaxed text-neutral-900"
      >
        {question.text}
      </h2>
      <p className="text-xs leading-relaxed text-neutral-600">
        최근 한 달의 평소 상태에 가장 가까운 답을 골라주세요. 선택하면 다음 문항으로 이동해요.
      </p>
      <fieldset disabled={busy} className="space-y-3">
        <legend className="sr-only">{question.text} 선택지</legend>
        {question.choices.map((choice, index) => (
          <label
            key={`${question.id}-${index}`}
            className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm leading-relaxed ${answers[question.id] === index + 1 ? "border-primary-700 bg-primary-50 text-primary-800" : "border-neutral-200 text-neutral-700"}`}
          >
            <input
              type="radio"
              name={question.id}
              value={index + 1}
              checked={answers[question.id] === index + 1}
              onChange={() => choose(index + 1)}
              className="h-4 w-4 shrink-0 accent-primary-700"
            />
            <span>
              {index + 1}. {choice}
            </span>
          </label>
        ))}
      </fieldset>
      <div className="flex gap-3">
        <button
          type="button"
          className="button-secondary flex-1"
          disabled={busy || step === 0}
          onClick={() => navigate(step - 1)}
        >
          이전
        </button>
        {step < 11 ? (
          <button
            type="button"
            className="button-primary flex-1"
            disabled={busy || !answers[question.id]}
            onClick={() => navigate(step + 1)}
          >
            다음
          </button>
        ) : (
          <button
            type="button"
            className="button-primary flex-1"
            disabled={busy || !answers[question.id]}
            onClick={submit}
          >
            {busy ? "저장 중…" : error ? "재시도" : "문진 완료하기"}
          </button>
        )}
      </div>
      {busy && (
        <p role="status" className="text-sm text-neutral-600">
          응답을 저장하고 있어요.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm leading-relaxed text-status-danger">
          {error}
        </p>
      )}
      <p className="text-xs leading-relaxed text-neutral-600">
        키보드 1~4로 선택하고 좌우 방향키로 이동할 수 있어요. 답변은 완료 버튼을 누를 때 저장됩니다.
      </p>
    </section>
  );
}
