import { isCatalogPreviewOnly } from "@/lib/server-env";
import { catalogIdentity } from "@/lib/catalog/http";
import { getLatestCatalogReportId } from "@/lib/catalog/curationService";
import { SkinShop } from "@/components/catalog/SkinShop";
import { PageHeading } from "@/components/ui/PageHeading";
import { MedicalDisclaimerNotice } from "@/components/layout/MedicalDisclaimerNotice";
import { ProductRecommendationsLoader } from "@/components/catalog/ProductRecommendationsLoader";
import { cosmeticDisclaimer } from "@/lib/catalog/types";
import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
export const dynamic = "force-dynamic";
export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ reportId?: string | string[] }>;
}) {
  const params = await searchParams;
  const reportId = isCatalogPreviewOnly()
    ? null
    : params.reportId === undefined
      ? await getLatestCatalogReportId(await catalogIdentity())
      : params.reportId;
  return (
    <div className="space-y-6 break-keep">
      <PageHeading
        eyebrow="맞춤 화장품"
        title="피부로 고르는 뷰티 스토어"
        description="내 피부 타입과 성분으로 골라보세요."
      />
      <Link
        href="/catalog/products/guide"
        className="flex min-h-14 items-center gap-3 rounded-2xl border border-primary-200 bg-primary-50 p-4 hover:bg-primary-100"
      >
        <BookOpen
          aria-hidden="true"
          size={22}
          strokeWidth={1.75}
          className="shrink-0 text-primary-700"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-primary-800">
            스킨케어가 처음이라면
          </span>
          <span className="mt-1 block text-xs leading-relaxed text-neutral-700">
            토너·앰플·크림의 역할과 사용 순서부터 알아봐요.
          </span>
        </span>
        <ArrowRight
          aria-hidden="true"
          size={18}
          strokeWidth={1.75}
          className="shrink-0 text-primary-700"
        />
      </Link>
      {reportId !== null && reportId !== undefined ? (
        <ProductRecommendationsLoader
          key={String(reportId)}
          reportId={typeof reportId === "string" ? reportId : ""}
        />
      ) : (
        <SkinShop />
      )}
      <p className="text-xs leading-relaxed text-neutral-600">{cosmeticDisclaimer}</p>
      <MedicalDisclaimerNotice compact />
    </div>
  );
}
