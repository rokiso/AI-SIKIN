import { Droplets, FlaskConical, Layers3, Sun } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeading } from "@/components/ui/PageHeading";

const categories = [
  { label: "토너", icon: Droplets }, { label: "앰플", icon: FlaskConical },
  { label: "크림", icon: Layers3 }, { label: "자외선 차단제", icon: Sun },
];

export default function ProductsPage() {
  return (
    <div className="space-y-6 break-keep">
      <PageHeading eyebrow="맞춤 화장품" title="유행보다 내 피부에 맞게" description="피부 타입과 성분을 기준으로 일상 관리 제품을 살펴볼 수 있는 공간이에요." />
      <section aria-labelledby="categories-heading">
        <h2 id="categories-heading" className="mb-3 text-base font-semibold text-neutral-900">살펴볼 제품 종류</h2>
        <ul className="grid grid-cols-2 gap-3">{categories.map(({ label, icon: Icon }) => (
          <li key={label} className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-surface p-4 text-sm font-medium text-neutral-700"><Icon aria-hidden="true" strokeWidth={1.75} className="h-5 w-5 shrink-0 text-primary-700" />{label}</li>
        ))}</ul>
      </section>
      <EmptyState title="아직 맞춤 추천 제품이 없어요" description="진단과 제품 추천 기능을 준비하고 있어요. 먼저 피부 진단 과정을 확인해 보세요." />
    </div>
  );
}
