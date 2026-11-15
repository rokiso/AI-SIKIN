import Link from "next/link";
import { PageHeading } from "@/components/ui/PageHeading";
import { MedicalDisclaimerNotice } from "@/components/layout/MedicalDisclaimerNotice";
import { ProductRecommendationsLoader } from "@/components/catalog/ProductRecommendationsLoader";
import { categories, cosmeticDisclaimer } from "@/lib/catalog/types";
export const dynamic = "force-dynamic";
export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ reportId?: string | string[] }>;
}) {
  const { reportId } = await searchParams;
  return (
    <div className="space-y-6 break-keep">
      <PageHeading
        eyebrow="맞춤 화장품"
        title="유행보다 내 피부에 맞게"
        description="피부 타입과 성분을 기준으로 일상 관리 제품을 살펴볼 수 있는 공간이에요."
      />
      {reportId ? (
        <ProductRecommendationsLoader
          key={String(reportId)}
          reportId={typeof reportId === "string" ? reportId : ""}
        />
      ) : (
        <section className="space-y-4 rounded-2xl border border-neutral-200 p-5">
          <h2 className="text-base font-semibold">먼저 내 피부 리포트를 확인해 주세요</h2>
          <p className="text-sm leading-relaxed text-neutral-700">
            진단 결과가 있으면 리포트의 피부 타입과 추천 성분을 기준으로 제품을 골라드려요. 현재
            사진 테스트 모드에서는 진단 리포트를 생성하지 않습니다.
          </p>
          <ul className="grid grid-cols-2 gap-3">
            {categories.map((c) => (
              <li key={c.category} className="rounded-xl bg-surface-muted p-3 text-sm">
                {c.categoryNameKo}
              </li>
            ))}
          </ul>
          <p className="text-sm leading-relaxed text-neutral-700">
            아직 맞춤 추천 제품이 없어요. 실제 상품과 제휴 구매처를 확인한 뒤 순차적으로 안내할
            예정입니다.
          </p>
          <Link href="/" className="button-secondary flex items-center justify-center">
            내 리포트 확인하기
          </Link>
        </section>
      )}
      <p className="text-xs leading-relaxed text-neutral-600">{cosmeticDisclaimer}</p>
      <MedicalDisclaimerNotice compact />
    </div>
  );
}
