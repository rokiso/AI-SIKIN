"use client";
import { useState } from "react";
import type { ProductRecommendationResponse } from "@/lib/catalog/types";
import { ProductCard } from "./ProductCard";
export function ProductRecommendationSection({ data }: { data: ProductRecommendationResponse }) {
  const [active, setActive] = useState(0);
  const selected = data.categories[active];
  return (
    <section className="space-y-5" aria-label="맞춤 화장품 추천">
      <h2 className="text-base font-semibold text-neutral-900">성분 기준 추천</h2>
      <div className="rounded-xl bg-primary-50 p-4 text-sm leading-relaxed text-primary-800">
        {data.baumannType} 리포트의 피부 타입과 성분을 기준으로 골랐어요. 사용감과 성분 적합성은
        개인마다 다를 수 있습니다.
      </div>
      <div
        role="tablist"
        aria-label="화장품 종류"
        className="grid grid-cols-2 gap-2 sm:grid-cols-4"
      >
        {data.categories.map((category, i) => (
          <button
            key={category.category}
            id={`tab-${category.category}`}
            type="button"
            role="tab"
            aria-selected={active === i}
            aria-controls={`panel-${category.category}`}
            tabIndex={active === i ? 0 : -1}
            onClick={() => setActive(i)}
            onKeyDown={(e) => {
              let next: number | undefined;
              if (e.key === "ArrowRight") next = (i + 1) % data.categories.length;
              if (e.key === "ArrowLeft")
                next = (i - 1 + data.categories.length) % data.categories.length;
              if (e.key === "Home") next = 0;
              if (e.key === "End") next = data.categories.length - 1;
              if (next !== undefined) {
                e.preventDefault();
                setActive(next);
                document.getElementById(`tab-${data.categories[next].category}`)?.focus();
              }
            }}
            className={active === i ? "button-primary" : "button-secondary"}
          >
            {category.categoryNameKo}
          </button>
        ))}
      </div>
      {selected && (
        <div
          key={selected.category}
          role="tabpanel"
          id={`panel-${selected.category}`}
          aria-labelledby={`tab-${selected.category}`}
          className="space-y-4"
        >
          {selected.isFallbackActive && (
            <p role="status" className="rounded-xl bg-surface-muted p-4 text-sm">
              주력 상품의 연결이 중단되어 대체 상품을 먼저 안내합니다.
            </p>
          )}
          {selected.isFallbackActive && selected.secondaryProduct ? (
            <ProductCard product={selected.secondaryProduct} secondary />
          ) : selected.primaryProduct ? (
            <ProductCard product={selected.primaryProduct} />
          ) : (
            <div className="space-y-3 rounded-2xl border border-neutral-200 p-5">
              <h3 className="font-semibold">맞춤 제품을 선별 중이에요</h3>
              <p className="text-sm leading-relaxed text-neutral-700">
                현재 피부 타입에 맞는 최적 제품을 선별 중입니다. 순차적으로 맞춤 화장품이 업데이트될
                예정입니다.
              </p>
              <p className="text-sm">
                성분 가이드:{" "}
                {data.recommendedIngredients.join(" · ") ||
                  "전성분과 평소 사용 경험을 함께 확인해 주세요."}
              </p>
            </div>
          )}
          {!selected.isFallbackActive && selected.secondaryProduct && (
            <details className="rounded-2xl border border-neutral-200 p-3">
              <summary className="flex min-h-12 cursor-pointer items-center px-2 text-sm font-medium text-primary-800">
                대체 상품 보기
              </summary>
              <div className="mt-3">
                <ProductCard product={selected.secondaryProduct} secondary />
              </div>
            </details>
          )}
        </div>
      )}
      <p className="text-xs leading-relaxed text-neutral-600">
        판매처로 이동하며, 제휴 링크를 통한 구매 시 SIKIN이 수수료를 받을 수 있습니다.
        가격·재고·판매 조건은 판매처에서 확인해 주세요.
      </p>
    </section>
  );
}
