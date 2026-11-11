import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { LatestDiagnostic } from "@/lib/dashboard/types";

const metrics = [
  { key: "oiliness", label: "유분" },
  { key: "sensitivity", label: "민감도" },
  { key: "pigmentation", label: "색소" },
  { key: "elasticity", label: "탄력" },
] as const;

function IngredientList({ title, ingredients, emptyText }: { title: string; ingredients: string[]; emptyText: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
      {ingredients.length ? (
        <ul className="mt-2 flex flex-wrap gap-2">
          {ingredients.map((ingredient, index) => <li key={`${ingredient}-${index}`} className="rounded-xl border border-neutral-200 bg-surface px-3 py-2 text-sm text-neutral-700">{ingredient}</li>)}
        </ul>
      ) : <p className="mt-2 text-sm leading-relaxed text-neutral-600">{emptyText}</p>}
    </div>
  );
}

export function SkinSummaryCard({ diagnostic }: { diagnostic: LatestDiagnostic }) {
  const diagnosedDate = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeZone: "Asia/Seoul" }).format(new Date(diagnostic.diagnosedAt));
  return (
    <section aria-labelledby="skin-summary-heading" className="space-y-5 break-keep rounded-2xl border border-primary-100 bg-primary-50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="skin-summary-heading" className="text-sm font-semibold text-primary-800">최근 피부 분석</h2>
        <time dateTime={diagnostic.diagnosedAt} className="text-xs text-neutral-600">{diagnosedDate} · 한국 시간</time>
      </div>
      <div>
        <span className="inline-flex rounded-xl bg-surface px-3 py-2 text-2xl font-bold tracking-wider text-primary-800">{diagnostic.baumannType}</span>
        <p className="mt-3 text-base font-semibold leading-relaxed text-neutral-900">{diagnostic.baumannNameKo}</p>
        <p className="mt-2 text-sm leading-relaxed text-neutral-700">{diagnostic.summary || "아직 피부 상태 설명이 등록되지 않았어요."}</p>
      </div>
      <div className="border-y border-primary-100 py-5">
        <h3 className="mb-4 text-sm font-semibold text-neutral-900">피부 지표 살펴보기</h3>
        <dl className="grid grid-cols-2 gap-x-5 gap-y-4">
          {metrics.map(({ key, label }) => (
            <div key={key}>
              <dt className="float-left text-xs font-medium text-neutral-700">{label}</dt>
              <dd className="text-right text-xs font-semibold tabular-nums text-primary-800">
                {diagnostic.axisScores[key]}<span className="font-normal text-neutral-600"> / 100</span>
                <div role="meter" aria-label={`${label} 지표`} aria-valuenow={diagnostic.axisScores[key]} aria-valuemin={0} aria-valuemax={100} className="mt-2 h-2 overflow-hidden rounded-full bg-primary-100">
                  <div aria-hidden="true" className="h-full rounded-full bg-primary-700" style={{ width: `${diagnostic.axisScores[key]}%` }} />
                </div>
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-xs leading-relaxed text-neutral-600">수치는 각 항목의 정도를 나타내며, 높고 낮음이 건강 등급을 뜻하지는 않아요.</p>
      </div>
      <IngredientList title="권장 성분" ingredients={diagnostic.recommendedIngredients} emptyText="권장 성분 정보가 아직 등록되지 않았어요." />
      <IngredientList title="주의 성분" ingredients={diagnostic.cautionIngredients} emptyText="등록된 주의 성분 정보가 없어요." />
      <Link href="/mypage" className="button-secondary flex justify-between">진단 이력 보러 가기<ArrowRight aria-hidden="true" size={18} strokeWidth={1.75} /></Link>
    </section>
  );
}
