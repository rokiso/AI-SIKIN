import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import { RoutineGuide } from "@/components/guide/RoutineGuide";
import { SeasonalMoistureGuide } from "@/components/guide/SeasonalMoistureGuide";
import { MedicalDisclaimerNotice } from "@/components/layout/MedicalDisclaimerNotice";
import { PageHeading } from "@/components/ui/PageHeading";
import { productRoles } from "@/lib/guide/skincare";

export const metadata: Metadata = {
  title: "스킨케어 처음 시작하기",
  description:
    "토너·앰플·크림의 역할과 아침·저녁 사용 순서, 피부 상태와 환경에 따른 보습 조절을 배워보세요.",
};

export default function SkincareGuidePage() {
  return (
    <div className="space-y-8 break-keep">
      <PageHeading
        eyebrow="스킨케어 입문"
        title="처음이라면, 기본부터"
        description="토너는 뭘까? 크림은 언제 바를까? 제품을 더 사기 전에 역할과 순서부터 알아봐요."
      />
      <nav aria-label="입문 가이드 목차" className="flex flex-wrap gap-2">
        <a href="#products" className="button-secondary">
          제품 역할
        </a>
        <a href="#routine" className="button-secondary">
          사용 순서
        </a>
        <a href="#moisture" className="button-secondary">
          보습 조절
        </a>
      </nav>
      <section id="products" aria-labelledby="products-heading" className="space-y-4">
        <div>
          <p className="text-xs font-semibold text-primary-700">01 · 제품 이해</p>
          <h2 id="products-heading" className="mt-2 text-lg font-semibold text-neutral-900">
            무엇을 바르는 걸까요?
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-neutral-600">
            이름을 눌러 역할을 살펴보세요. 모든 단계를 갖출 필요는 없어요.
          </p>
        </div>
        <div className="divide-y divide-neutral-200 overflow-hidden rounded-2xl border border-neutral-200">
          {productRoles.map((product, index) => (
            <details key={product.name} className="group bg-surface" open={index === 0}>
              <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 p-4 text-sm font-semibold text-neutral-900 [&::-webkit-details-marker]:hidden">
                <span aria-hidden="true" className="text-primary-700">
                  0{index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  {product.name}
                  <span className="mt-1 block text-xs font-normal text-neutral-600">
                    {product.purpose}
                  </span>
                </span>
                <ChevronDown
                  aria-hidden="true"
                  size={18}
                  strokeWidth={1.75}
                  className="shrink-0 group-open:rotate-180"
                />
              </summary>
              <div className="space-y-3 px-4 pb-5 text-sm leading-relaxed text-neutral-700">
                <p>{product.description}</p>
                <p>
                  <strong className="font-semibold text-neutral-900">어떻게 사용할까요? </strong>
                  {product.use}
                </p>
                <p className="rounded-xl bg-surface-muted p-3">{product.note}</p>
              </div>
            </details>
          ))}
        </div>
        <p className="text-sm leading-relaxed text-neutral-700">
          가격이 비싸거나 대표 성분의 함량이 높다고 무조건 더 잘 맞는 것은 아니에요. 지금 잘 맞는
          제품이 있다면 먼저 사용해 보세요.
        </p>
      </section>
      <RoutineGuide />
      <SeasonalMoistureGuide />
      <section
        aria-labelledby="guide-next-heading"
        className="space-y-3 border-t border-neutral-200 pt-6"
      >
        <h2 id="guide-next-heading" className="text-lg font-semibold text-neutral-900">
          이제 내 피부에 맞게 살펴봐요
        </h2>
        <p className="text-sm leading-relaxed text-neutral-600">
          기본 관리에 익숙해진 뒤, 필요한 제품만 천천히 살펴보세요.
        </p>
        <Link href="/catalog/products" className="button-primary w-full">
          화장품 둘러보기
          <ArrowRight aria-hidden="true" size={18} strokeWidth={1.75} />
        </Link>
        <Link href="/diagnostic" className="button-secondary w-full">
          문진으로 내 피부 특성 알아보기
        </Link>
      </section>
      <p className="text-xs leading-relaxed text-neutral-600">
        일반적인 관리 원리를 안내하는 학습용 가이드예요. 피부 질환의 진단이나 개인별 치료 방법을
        제공하지 않아요.
      </p>
      <MedicalDisclaimerNotice compact />
    </div>
  );
}
