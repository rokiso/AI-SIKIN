"use client";

import { useState } from "react";
import { environments, skinFeelings } from "@/lib/guide/skincare";

export function SeasonalMoistureGuide() {
  const [feeling, setFeeling] = useState<(typeof skinFeelings)[number]>(skinFeelings[3]);
  const [environment, setEnvironment] = useState<(typeof environments)[number]>(environments[2]);

  return (
    <section id="moisture" aria-labelledby="moisture-heading" className="space-y-5">
      <div>
        <p className="text-xs font-semibold text-primary-700">03 · 보습 조절</p>
        <h2 id="moisture-heading" className="mt-2 text-lg font-semibold text-neutral-900">
          계절마다 꼭 바꿔야 하나요?
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-700">
          달력이 바뀌었다고 제품을 전부 바꿀 필요는 없어요. 기온·습도와 냉난방에 따라 당김이나
          번들거림이 달라질 수 있어, 피부 상태를 보고 보습을 조절해요.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-neutral-700">
          건조한 공기에서는 피부의 수분이 쉽게 빠져나가 당길 수 있고, 덥고 습하면 같은 제품도 무겁게
          느껴질 수 있어요. 먼저 사용량과 횟수를 조절하고, 그래도 불편할 때 제형을 살펴봐요.
        </p>
      </div>
      <fieldset>
        <legend className="mb-3 text-sm font-semibold text-neutral-900">
          지금 피부는 어떻게 느껴지나요?
        </legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {skinFeelings.map((option) => (
            <label
              key={option.value}
              className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm leading-relaxed ${feeling.value === option.value ? "border-primary-700 bg-primary-50 text-primary-800" : "border-neutral-200 bg-surface text-neutral-700"}`}
            >
              <input
                type="radio"
                name="skin-feeling"
                value={option.value}
                checked={feeling.value === option.value}
                onChange={() => setFeeling(option)}
                className="h-5 w-5 shrink-0 accent-primary-700"
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-3 text-sm font-semibold text-neutral-900">
          주로 머무는 환경은 어떤가요?
        </legend>
        <div className="space-y-2">
          {environments.map((option) => (
            <label
              key={option.value}
              className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm leading-relaxed ${environment.value === option.value ? "border-primary-700 bg-primary-50 text-primary-800" : "border-neutral-200 bg-surface text-neutral-700"}`}
            >
              <input
                type="radio"
                name="skin-environment"
                value={option.value}
                checked={environment.value === option.value}
                onChange={() => setEnvironment(option)}
                className="h-5 w-5 shrink-0 accent-primary-700"
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div
        role="status"
        aria-atomic="true"
        className="space-y-3 rounded-2xl border border-primary-200 bg-primary-50 p-5 text-sm leading-relaxed text-neutral-700"
      >
        <h3 className="font-semibold text-primary-800">지금 선택한 상황의 보습 힌트</h3>
        <p className="font-medium">
          {feeling.label} · {environment.label}
        </p>
        <p>{feeling.tip}</p>
        <p>{environment.tip}</p>
        <p className="font-semibold text-primary-800">
          잘 맞고 편안하다면 그대로 사용해도 괜찮아요.
        </p>
      </div>
      <p className="text-xs leading-relaxed text-neutral-600">
        선택은 설명을 살펴보기 위한 예시이며 피부 타입 진단이 아니에요. 선택 내용은 저장하지 않으며
        새로고침하면 처음 상태로 돌아와요.
      </p>
      <p className="text-sm leading-relaxed text-neutral-700">
        따갑거나 붉어지는 제품을 더 겹쳐 바르지는 마세요. 불편이 지속되거나 심하면 사용을 멈추고
        피부과 전문의와 상담해요.
      </p>
    </section>
  );
}
