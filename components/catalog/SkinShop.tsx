"use client";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Search,
  ArrowUpRight,
  SlidersHorizontal,
  Droplets,
  FlaskConical,
  Layers3,
  Sun,
  LayoutGrid,
  Package,
} from "lucide-react";
import {
  categories,
  type ProductRecommendationResponse,
  type ProductView,
} from "@/lib/catalog/types";
import { getShopDemo, describeSkinType, skinTypeOptions } from "@/lib/catalog/shop-demo";
import { ProductIllustration } from "./ProductIllustration";
import { ProductDetailDialog } from "./ProductDetailDialog";
const icons = [LayoutGrid, Droplets, FlaskConical, Layers3, Sun];
const filters = [{ category: "ALL", categoryNameKo: "전체" }, ...categories];
export function SkinShop({ data }: { data?: ProductRecommendationResponse }) {
  const [exampleType, setExampleType] = useState("DSNW");
  const [category, setCategory] = useState("ALL");
  const [query, setQuery] = useState("");
  const [ingredient, setIngredient] = useState("");
  const [sort, setSort] = useState("recommended");
  const [selected, setSelected] = useState<{ product: ProductView; secondary: boolean } | null>(
    null,
  );
  const demo = !data;
  const catalog = data ?? getShopDemo(exampleType);
  const products = catalog.categories.flatMap((c) => [
    ...(c.primaryProduct
      ? [
          {
            product: c.primaryProduct,
            category: c.category,
            label: c.categoryNameKo,
            secondary: false,
            fallback: false,
          },
        ]
      : []),
    ...(c.secondaryProduct
      ? [
          {
            product: c.secondaryProduct,
            category: c.category,
            label: c.categoryNameKo,
            secondary: true,
            fallback: c.isFallbackActive,
          },
        ]
      : []),
  ]);
  const ingredientOptions = [...new Set(products.flatMap((p) => p.product.keyIngredients))].sort();
  const searched = query.normalize("NFKC").toLowerCase().trim();
  const visible = products
    .filter(
      (p) =>
        (category === "ALL" || p.category === category) &&
        (!ingredient || p.product.keyIngredients.includes(ingredient)) &&
        (!searched ||
          [p.product.productName, p.product.brandName, ...p.product.keyIngredients]
            .join(" ")
            .normalize("NFKC")
            .toLowerCase()
            .includes(searched)),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.product.productName.localeCompare(b.product.productName, "ko")
        : Number(b.fallback) - Number(a.fallback) ||
          Number(a.product.status !== "ACTIVE") - Number(b.product.status !== "ACTIVE") ||
          Number(a.secondary) - Number(b.secondary),
    );
  function reset() {
    setCategory("ALL");
    setQuery("");
    setIngredient("");
    setSort("recommended");
  }
  return (
    <section className="space-y-6" aria-label="피부 타입 맞춤 쇼핑">
      <div className="space-y-3 rounded-2xl bg-primary-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-neutral-900">내 피부 쇼핑 기준</h2>
          <span className="rounded-lg bg-surface px-2 py-1 text-xs font-medium text-primary-800">
            {demo ? "쇼핑 화면 체험" : "내 리포트 기반"}
          </span>
        </div>
        <p className="text-sm leading-relaxed text-neutral-700">
          {demo
            ? "예시 타입으로 둘러보세요. 가상 상품이며 실제 진단·구매 결과가 아닙니다."
            : "본인 리포트로 고른 제품입니다. 성분을 비교하고 판매처를 확인하세요."}
        </p>
        {demo ? (
          <label className="block text-xs font-medium text-primary-800">
            예시 피부 타입
            <select
              aria-label="예시 피부 타입"
              value={exampleType}
              className="mt-2 min-h-12 w-full rounded-xl border border-primary-200 bg-surface p-3 text-sm text-neutral-900"
              onChange={(e) => {
                setExampleType(e.target.value);
                setIngredient("");
              }}
            >
              {skinTypeOptions.map((code) => (
                <option key={code} value={code}>
                  {code} · {describeSkinType(code)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="rounded-xl bg-surface p-3 text-sm font-medium text-primary-800">
            {catalog.baumannType} · {describeSkinType(catalog.baumannType)}
          </p>
        )}
        <div>
          <p className="mb-2 text-xs text-neutral-600">
            {demo ? "탐색 성분 예시" : "내 리포트의 추천 성분"}
          </p>
          <ul className="flex flex-wrap gap-2">
            {catalog.recommendedIngredients.map((name) => (
              <li
                key={name}
                className="rounded-lg border border-primary-200 bg-surface px-2 py-1 text-xs text-primary-800"
              >
                {name}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-4 h-5 w-5 text-neutral-500"
          strokeWidth={1.75}
        />
        <input
          aria-label="상품·브랜드·성분 검색"
          placeholder="상품, 브랜드, 성분을 검색하세요"
          type="search"
          maxLength={100}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-h-14 w-full rounded-xl border border-neutral-300 bg-surface py-3 pl-10 pr-3 text-sm"
        />
      </div>
      <div role="tablist" aria-label="화장품 종류" className="grid grid-cols-5 gap-1">
        {filters.map((filter, i) => {
          const Icon = icons[i];
          return (
            <button
              key={filter.category}
              id={`shop-tab-${filter.category}`}
              type="button"
              role="tab"
              aria-selected={category === filter.category}
              aria-controls="shop-products"
              tabIndex={category === filter.category ? 0 : -1}
              onClick={() => setCategory(filter.category)}
              onKeyDown={(e) => {
                const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
                if (!keys.includes(e.key)) return;
                e.preventDefault();
                const next =
                  e.key === "Home"
                    ? 0
                    : e.key === "End"
                      ? filters.length - 1
                      : (i + (e.key === "ArrowRight" ? 1 : -1) + filters.length) % filters.length;
                setCategory(filters[next].category);
                document.getElementById(`shop-tab-${filters[next].category}`)?.focus();
              }}
              className={`flex min-h-20 min-w-0 flex-col items-center justify-center gap-2 rounded-xl px-1 py-2 text-center text-xs ${category === filter.category ? "bg-primary-700 font-semibold text-surface" : "bg-surface-muted text-neutral-700"}`}
            >
              <Icon aria-hidden="true" strokeWidth={1.75} className="h-5 w-5" />
              <span>
                {filter.categoryNameKo === "자외선 차단제" ? "선케어" : filter.categoryNameKo}
              </span>
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs text-neutral-600">
          <span className="mb-2 flex items-center gap-1">
            <SlidersHorizontal aria-hidden="true" className="h-3 w-3" />
            성분 필터
          </span>
          <select
            aria-label="성분 필터"
            value={ingredient}
            onChange={(e) => setIngredient(e.target.value)}
            className="min-h-12 w-full rounded-xl border border-neutral-200 bg-surface p-2 text-sm text-neutral-900"
          >
            <option value="">모든 성분</option>
            {ingredientOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-neutral-600">
          <span className="mb-2 block">정렬</span>
          <select
            aria-label="상품 정렬"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="min-h-12 w-full rounded-xl border border-neutral-200 bg-surface p-2 text-sm text-neutral-900"
          >
            <option value="recommended">{demo ? "구성 예시순" : "주력·대체순"}</option>
            <option value="name">상품명순</option>
          </select>
        </label>
      </div>
      <div
        id="shop-products"
        role="tabpanel"
        aria-labelledby={`shop-tab-${category}`}
        className="space-y-4"
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-neutral-900">
            {category === "ALL"
              ? "내 피부 쇼핑 리스트"
              : filters.find((f) => f.category === category)?.categoryNameKo}
          </h3>
          <p role="status" aria-live="polite" className="text-xs text-neutral-600">
            {visible.length}개 {demo ? "상품 예시" : "추천 상품"}
          </p>
        </div>
        {catalog.categories.some((c) => c.isFallbackActive) && !demo && (
          <p className="rounded-xl bg-surface-muted p-3 text-sm text-neutral-700">
            연결이 중단된 주력 상품은 같은 종류의 대체 상품을 먼저 안내합니다.
          </p>
        )}
        {visible.length ? (
          <div className="grid grid-cols-2 gap-x-3 gap-y-6">
            {visible.map((entry) => (
              <article key={entry.product.id} className="min-w-0 space-y-2">
                <button
                  type="button"
                  onClick={() => setSelected(entry)}
                  className="block w-full overflow-hidden rounded-2xl bg-surface-muted text-left"
                >
                  <span className="sr-only">{entry.product.productName} 상세 보기</span>
                  <span className="block p-2 text-xs font-medium text-primary-800">
                    {demo
                      ? "가상 상품"
                      : entry.fallback
                        ? "대체 추천"
                        : entry.secondary
                          ? "대체 상품"
                          : "주력 상품"}
                  </span>
                  <span className="block aspect-square px-3 pb-3">
                    {entry.product.thumbnailUrl ? (
                      <Image
                        src={entry.product.thumbnailUrl}
                        width={160}
                        height={160}
                        unoptimized
                        alt=""
                        className="h-full w-full object-contain"
                      />
                    ) : demo ? (
                      <ProductIllustration category={entry.category} />
                    ) : (
                      <span className="flex h-full flex-col items-center justify-center gap-2 text-neutral-600">
                        <Package aria-hidden="true" strokeWidth={1.75} className="h-8 w-8" />
                        <span className="text-xs">이미지 준비 중</span>
                      </span>
                    )}
                  </span>
                </button>
                <p className="text-xs leading-relaxed text-neutral-600">
                  {entry.product.brandName}
                </p>
                <h4 className="text-sm font-semibold leading-relaxed text-neutral-900">
                  {entry.product.productName}
                </h4>
                <p className="text-xs font-medium text-neutral-700">
                  {demo ? "체험용 · 판매가 미등록" : "판매가·재고는 구매처에서 확인"}
                </p>
                <p className="text-xs leading-relaxed text-primary-800">
                  {entry.product.keyIngredients.join(" · ")}
                </p>
                {entry.product.status !== "ACTIVE" && (
                  <p className="text-xs font-medium text-neutral-600">
                    {entry.product.status === "OUT_OF_STOCK" ? "품절" : "연결 중단"}
                  </p>
                )}
                <button
                  type="button"
                  className="button-secondary min-h-12 w-full px-2 text-xs"
                  onClick={() => setSelected(entry)}
                >
                  성분·추천 이유
                </button>
                {!demo && entry.product.redirectPath && (
                  <a
                    href={entry.product.redirectPath}
                    className="button-primary flex min-h-12 items-center justify-center gap-1 px-2 text-xs"
                    rel="sponsored nofollow noreferrer"
                    referrerPolicy="no-referrer"
                  >
                    구매처 확인
                    <ArrowUpRight aria-hidden="true" className="h-3 w-3" />
                  </a>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="space-y-3 rounded-2xl border border-neutral-200 p-5">
            <h4 className="font-semibold">
              {products.length ? "조건에 맞는 상품이 없어요" : "맞춤 제품을 선별 중이에요"}
            </h4>
            <p className="text-sm leading-relaxed text-neutral-600">
              {products.length
                ? "다른 검색어나 성분을 선택해 보세요."
                : "실제 제품의 성분과 판매처를 확인한 뒤 순차적으로 안내합니다."}
            </p>
            <p className="text-sm text-neutral-700">
              성분 가이드:{" "}
              {catalog.recommendedIngredients.join(" · ") ||
                "전성분과 평소 사용 경험을 함께 확인해 주세요."}
            </p>
            {products.length > 0 && (
              <button type="button" className="button-secondary w-full" onClick={reset}>
                필터 초기화
              </button>
            )}
          </div>
        )}
      </div>
      <div className="space-y-3 border-t border-neutral-200 pt-5">
        <p className="text-xs leading-relaxed text-neutral-600">
          {demo
            ? "지금은 쇼핑 화면 체험입니다. 실제 판매 상품·가격·평점·제휴 링크는 아직 등록되지 않았어요. 예시 타입 선택은 진단 기록을 변경하지 않습니다."
            : "판매처로 이동하며, 제휴 링크를 통한 구매 시 SIKIN이 수수료를 받을 수 있습니다. 성분 적합성과 사용감은 개인마다 다르며, 구매 전 전성분과 판매 조건을 확인하세요."}
        </p>
        {demo && (
          <Link href="/diagnostic" className="button-secondary flex items-center justify-center">
            사진 테스트 둘러보기
          </Link>
        )}
      </div>
      {selected && (
        <ProductDetailDialog
          product={selected.product}
          secondary={selected.secondary}
          demo={demo}
          onDismiss={() => setSelected(null)}
        />
      )}
    </section>
  );
}
