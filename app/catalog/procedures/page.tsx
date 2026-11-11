import { BookOpen, CircleHelp, Wallet } from "lucide-react";
import { PageHeading } from "@/components/ui/PageHeading";

const guideTopics = [
  { title: "시술의 원리", description: "어떤 원리로 피부에 작용하는지 살펴봐요.", icon: BookOpen },
  { title: "일반적인 가격 범위", description: "특정 병원의 할인 가격 대신 시장 기준 범위를 알아봐요.", icon: Wallet },
  { title: "확인할 주의사항", description: "부작용과 관리 방법, 상담할 때 물어볼 질문을 확인해요.", icon: CircleHelp },
];

export default function ProceduresPage() {
  return (
    <div className="break-keep">
      <PageHeading eyebrow="시술 가이드" title="충분히 알아보고 결정해요" description="시술의 원리와 가격 범위, 주의사항을 차분하게 살펴보는 정보 가이드를 준비하고 있어요." />
      <section aria-labelledby="guide-topics-heading">
        <h2 id="guide-topics-heading" className="text-base font-semibold text-neutral-900">가이드에서 살펴볼 정보</h2>
        <ul className="mt-4 divide-y divide-neutral-200 border-y border-neutral-200">{guideTopics.map(({ title, description, icon: Icon }) => (
          <li key={title} className="flex gap-3 py-5"><Icon aria-hidden="true" strokeWidth={1.75} className="mt-1 h-5 w-5 shrink-0 text-primary-700" /><div><h3 className="text-base font-semibold text-neutral-900">{title}</h3><p className="mt-1 text-sm leading-relaxed text-neutral-600">{description}</p></div></li>
        ))}</ul>
      </section>
      <section className="mt-6 rounded-2xl bg-surface-muted p-5">
        <h2 className="text-base font-semibold text-neutral-900">시술 목록을 준비하고 있어요</h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">이곳에서는 특정 병원이나 의료진을 추천하거나 예약을 연결하지 않아요. 시술에 대한 결정은 의료진과 충분히 상담해 주세요.</p>
      </section>
    </div>
  );
}
