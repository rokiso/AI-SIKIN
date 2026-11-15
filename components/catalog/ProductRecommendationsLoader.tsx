"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { recommendationsSchema, type ProductRecommendationResponse } from "@/lib/catalog/types";
import { ProductRecommendationSection } from "./ProductRecommendationSection";
export function ProductRecommendationsLoader({ reportId }: { reportId: string }) {
  const [data, setData] = useState<ProductRecommendationResponse | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timer = setTimeout(() => controller.abort(), 10_000);
    async function load() {
      try {
        const response = await fetch(
          `/api/v1/catalog/products/recommendations?${new URLSearchParams({ reportId })}`,
          { cache: "no-store", credentials: "same-origin", signal: controller.signal },
        );
        if (!response.ok) throw new Error("Catalog unavailable");
        const body: unknown = await response.json();
        if (typeof body !== "object" || body === null || !("data" in body))
          throw new Error("Invalid catalog");
        const result = recommendationsSchema.parse(body.data);
        if (active) setData(result);
      } catch {
        if (active) setError(true);
      } finally {
        clearTimeout(timer);
      }
    }
    void load();
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [reportId, attempt]);
  if (error)
    return (
      <section
        role="alert"
        aria-label="추천 상품 오류"
        className="space-y-4 rounded-2xl border border-neutral-200 p-5"
      >
        <p>
          추천 상품을 불러오는 중 오류가 발생했습니다. 본인의 리포트인지 확인한 후 다시
          시도해주세요.
        </p>
        <button
          className="button-secondary w-full"
          onClick={() => {
            setError(false);
            setData(null);
            setAttempt((n) => n + 1);
          }}
        >
          다시 시도
        </button>
        <Link href="/" className="button-secondary flex items-center justify-center">
          내 리포트 확인하기
        </Link>
      </section>
    );
  if (!data)
    return (
      <div role="status" aria-label="추천 상품을 불러오는 중" className="grid gap-4 sm:grid-cols-2">
        {[0, 1, 2, 3].map((n) => (
          <div key={n} className="h-48 rounded-2xl bg-surface-muted p-5 motion-safe:animate-pulse">
            <div className="h-16 w-16 rounded-xl bg-neutral-200" />
            <p className="mt-5 text-sm text-neutral-600">추천 상품을 불러오고 있어요…</p>
          </div>
        ))}
      </div>
    );
  return <ProductRecommendationSection data={data} />;
}
