import { catalogIdentity } from "@/lib/catalog/http";
import { getLatestCatalogReportId } from "@/lib/catalog/curationService";
import { SkinShop } from "@/components/catalog/SkinShop";
import { PageHeading } from "@/components/ui/PageHeading";
import { MedicalDisclaimerNotice } from "@/components/layout/MedicalDisclaimerNotice";
import { ProductRecommendationsLoader } from "@/components/catalog/ProductRecommendationsLoader";
import { cosmeticDisclaimer } from "@/lib/catalog/types";
export const dynamic = "force-dynamic";
export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ reportId?: string | string[] }>;
}) {
  const params = await searchParams;
  const reportId =
    params.reportId === undefined
      ? await getLatestCatalogReportId(await catalogIdentity())
      : params.reportId;
  return (
    <div className="space-y-6 break-keep">
      <PageHeading
        eyebrow="맞춤 화장품"
        title="피부로 고르는 뷰티 스토어"
        description="내 피부 타입과 성분으로 골라보세요."
      />
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
