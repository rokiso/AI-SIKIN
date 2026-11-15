import { Package, ExternalLink } from "lucide-react";
import type { ProductView } from "@/lib/catalog/types";
export function ProductCard({
  product,
  secondary = false,
}: {
  product: ProductView;
  secondary?: boolean;
}) {
  return (
    <article className="space-y-4 rounded-2xl border border-neutral-200 bg-surface p-5">
      <div className="flex gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-surface-muted">
          {product.thumbnailUrl /* eslint-disable-next-line @next/next/no-img-element -- reviewed local catalog asset, no third-party image request */ ? (
            <img
              src={product.thumbnailUrl}
              alt=""
              className="h-16 w-16 rounded-xl object-contain"
            />
          ) : (
            <Package aria-hidden="true" strokeWidth={1.75} className="h-7 w-7 text-primary-700" />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-neutral-600">
            {product.brandName} · {secondary ? "대체 상품" : "주력 상품"}
          </p>
          <h3 className="mt-1 text-base font-semibold text-neutral-900">{product.productName}</h3>
        </div>
      </div>
      <ul aria-label="핵심 성분" className="flex flex-wrap gap-2">
        {product.keyIngredients.map((name) => (
          <li key={name} className="rounded-lg bg-primary-50 px-2 py-1 text-xs text-primary-800">
            {name}
          </li>
        ))}
      </ul>
      <p className="text-sm leading-relaxed text-neutral-700">{product.recommendationReason}</p>
      {product.status !== "ACTIVE" && (
        <p className="text-sm font-medium text-neutral-700">
          {product.status === "OUT_OF_STOCK"
            ? "품절된 상품이에요."
            : "현재 연결이 중단된 상품이에요."}
        </p>
      )}
      {product.redirectPath ? (
        <a
          href={product.redirectPath}
          rel="sponsored nofollow noreferrer"
          referrerPolicy="no-referrer"
          className="button-primary flex w-full items-center justify-center gap-2"
        >
          구매처 확인
          <ExternalLink aria-hidden="true" strokeWidth={1.75} className="h-4 w-4" />
        </a>
      ) : (
        <p className="rounded-xl bg-surface-muted p-3 text-sm text-neutral-600">
          구매처 연결을 준비 중입니다. 다른 추천 상품을 확인해 주세요.
        </p>
      )}
    </article>
  );
}
