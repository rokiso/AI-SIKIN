import { isCatalogPreviewOnly } from "@/lib/server-env";
import Link from "next/link";
import { PageHeading } from "@/components/ui/PageHeading";
import { cosmeticDisclaimer } from "@/lib/catalog/types";
export default function RedirectErrorPage() {
  return (
    <div className="space-y-6 break-keep">
      <PageHeading
        eyebrow="구매처 연결"
        title={
          isCatalogPreviewOnly()
            ? "구매처 연결을 준비하고 있어요"
            : "다른 추천 상품을 확인해 주세요"
        }
        description={
          isCatalogPreviewOnly()
            ? "현재는 가상 상품으로 쇼핑 화면을 체험할 수 있습니다. 실제 상품 구매는 아직 연결되지 않았어요."
            : "해당 상품의 제휴 연결이 일시적으로 중단되었습니다. 다른 추천 상품을 확인해주세요."
        }
      />
      <Link href="/catalog/products" className="button-primary flex items-center justify-center">
        다른 추천 상품 보기
      </Link>
      <Link href="/" className="button-secondary flex items-center justify-center">
        리포트로 돌아가기
      </Link>
      <p className="text-xs leading-relaxed text-neutral-600">{cosmeticDisclaimer}</p>
    </div>
  );
}
