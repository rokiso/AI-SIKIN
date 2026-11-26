"use client";

import { useState } from "react";
import { Moon, Sun } from "lucide-react";

export function RoutineGuide() {
  const [time, setTime] = useState<"morning" | "evening">("morning");
  const [includeOptional, setIncludeOptional] = useState(false);
  const steps = [
    {
      name: "세안",
      description:
        time === "morning"
          ? "피부 상태에 맞게 부드럽게 씻어요. 세안 후 심한 당김이 남지 않는지 살펴봐요."
          : "사용한 자외선 차단제·메이크업의 세정 안내에 맞춰 씻어요. 이중 세안이 모두에게 필요한 것은 아니에요.",
    },
    ...(includeOptional
      ? [
          {
            name: "토너 · 선택",
            description: "가벼운 수분감이 더 필요할 때 사용해요. 생략해도 괜찮아요.",
          },
          {
            name: "앰플·세럼 · 선택",
            description: "추가하고 싶은 관리 목적이 있을 때 하나씩 사용해요. 생략해도 괜찮아요.",
          },
        ]
      : []),
    { name: "보습", description: "로션·젤크림·크림 중 지금 피부에 편안한 보습제로 마무리해요." },
    ...(time === "morning"
      ? [
          {
            name: "자외선 차단",
            description:
              "노출 환경에 맞춰 자외선 차단제를 사용해요. 사용량과 덧바르는 방법은 제품 표시를 확인해요.",
          },
        ]
      : []),
  ];

  return (
    <section id="routine" aria-labelledby="routine-heading" className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-primary-700">02 · 사용 순서</p>
        <h2 id="routine-heading" className="mt-2 text-lg font-semibold text-neutral-900">
          언제, 어떤 순서로 바를까요?
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">
          처음에는 간단한 관리부터 익숙해져요. 토너와 앰플을 모두 살 필요는 없어요.
        </p>
      </div>
      <div role="group" aria-label="아침·저녁 루틴 선택" className="grid grid-cols-2 gap-2">
        {(
          [
            { value: "morning", label: "아침", icon: Sun },
            { value: "evening", label: "저녁", icon: Moon },
          ] as const
        ).map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            aria-pressed={time === value}
            onClick={() => setTime(value)}
            className={time === value ? "button-primary" : "button-secondary"}
          >
            <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-neutral-200 p-3 text-sm leading-relaxed">
        <input
          type="checkbox"
          checked={includeOptional}
          onChange={(event) => setIncludeOptional(event.currentTarget.checked)}
          className="h-5 w-5 shrink-0 accent-primary-700"
        />
        토너·앰플을 쓰는 순서도 보기
      </label>
      <div role="status" aria-atomic="true" className="rounded-2xl bg-surface-muted p-5">
        <h3 className="text-sm font-semibold text-neutral-900">
          {time === "morning" ? "아침" : "저녁"} 루틴 예시
        </h3>
        <ol className="mt-4 space-y-4">
          {steps.map((step, index) => (
            <li key={step.name} className="flex gap-3">
              <span
                aria-hidden="true"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-800"
              >
                {index + 1}
              </span>
              <div>
                <p className="text-sm font-semibold text-neutral-900">{step.name}</p>
                <p className="mt-1 text-sm leading-relaxed text-neutral-700">{step.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
      <p className="text-xs leading-relaxed text-neutral-600">
        일반적인 순서 예시예요. 여러 제품은 대체로 묽은 제형부터 사용하지만, 개별 제품의 사용법이
        우선이에요. 레티노이드 등 사용법이 다른 제품은 표시된 안내를 따라요.
      </p>
    </section>
  );
}
