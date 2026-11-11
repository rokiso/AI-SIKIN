import Link from "next/link";
import { ArrowRight, ClipboardList, FlaskConical, ScanFace } from "lucide-react";

const benefits = [
  { title: "정밀 피부 분석(바우만 16타입)", description: "사진과 문진을 함께 살펴 내 피부의 특성을 알아봐요.", icon: ScanFace },
  { title: "성분 매칭 화장품 추천", description: "브랜드보다 내 피부와 맞는 성분을 기준으로 살펴봐요.", icon: FlaskConical },
  { title: "피부과 비급여 시술 투명 가격표", description: "시술의 원리와 일반적인 가격 범위를 알아보는 정보 가이드예요.", icon: ClipboardList },
];

const steps = ["정면 사진 준비", "12문항 문진", "피부 관리 가이드 확인"];

export function DashboardHeroOnboarding() {
  return (
    <div className="space-y-8 break-keep">
      <section className="pt-2">
        <p className="mb-4 text-sm font-semibold text-primary-700">나를 이해하는 스킨케어</p>
        <h1 className="text-2xl font-bold leading-snug tracking-tight text-neutral-900">내 피부에 딱 맞는 스킨케어, 3분 만에 찾기</h1>
        <p className="mt-4 text-base leading-relaxed text-neutral-600">회원가입 전에 먼저 내 피부를 살펴보세요. 사진 한 장과 평소의 피부 습관에서 시작해요.</p>
        <Link href="/diagnostic" className="button-primary mt-6 flex w-full justify-between">
          무료 AI 피부 진단 시작하기
          <ArrowRight aria-hidden="true" size={20} strokeWidth={1.75} className="shrink-0" />
        </Link>
        <p className="mt-3 text-xs leading-relaxed text-neutral-600">촬영과 문진 기능은 준비 중이에요. 지금은 진단 전 안내를 확인할 수 있어요.</p>
      </section>
      <section aria-labelledby="dashboard-process-heading">
        <h2 id="dashboard-process-heading" className="text-base font-semibold text-neutral-900">진단은 이렇게 진행돼요</h2>
        <ol className="mt-4 grid grid-cols-3 gap-3">
          {steps.map((step, index) => (
            <li key={step} className="border-t border-neutral-200 pt-3">
              <span aria-hidden="true" className="text-xs font-semibold text-primary-700">0{index + 1}</span>
              <p className="mt-2 text-sm leading-relaxed text-neutral-700">{step}</p>
            </li>
          ))}
        </ol>
      </section>
      <section aria-labelledby="dashboard-benefits-heading">
        <h2 id="dashboard-benefits-heading" className="text-lg font-semibold text-neutral-900">내 피부를 위한 세 가지 기준</h2>
        <ul className="mt-4 divide-y divide-neutral-200 rounded-2xl border border-neutral-200 bg-surface">
          {benefits.map(({ title, description, icon: Icon }) => (
            <li key={title} className="flex gap-3 p-4">
              <Icon aria-hidden="true" size={21} strokeWidth={1.75} className="mt-1 shrink-0 text-primary-700" />
              <div className="min-w-0">
                <h3 className="text-sm font-semibold leading-relaxed text-neutral-900">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-neutral-600">{description}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
