"use client";
import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import {
  ingredientResponseSchema,
  type IngredientProjection,
} from "@/lib/catalog/ingredient-types";
import { ingredientRegulatoryNotice, normalizeIngredient } from "@/lib/catalog/ingredient-rules";
type IngredientSheetProps = {
  productId: string;
  baumannType: string;
  reportId?: string;
  redirectPath: string | null;
};
export function ProductIngredientSheet({
  demo,
  ...props
}: IngredientSheetProps & { demo: boolean }) {
  if (demo)
    return (
      <section aria-label="제품 전성분 분석" className="space-y-3 break-keep">
        <h3 className="text-base font-semibold">전성분 &amp; 맞춤 성분 분석</h3>
        <p className="rounded-xl bg-surface-muted p-3 text-sm leading-relaxed text-neutral-700">
          체험용 가상 상품에는 검증된 전성분 정보가 없습니다. 실제 상품 등록 후 공식 전성분과 피부
          타입별 참고 정보를 확인할 수 있습니다.
        </p>
      </section>
    );
  return <LiveProductIngredientSheet {...props} />;
}
function LiveProductIngredientSheet({
  productId,
  baumannType,
  reportId,
  redirectPath,
}: IngredientSheetProps) {
  const [data, setData] = useState<IngredientProjection | null>(null);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setData(null);
      setError(false);
      try {
        const params = new URLSearchParams(reportId ? { reportId } : { baumannType });
        const response = await fetch(
          `/api/v1/catalog/products/${encodeURIComponent(productId)}/ingredients?${params}`,
          {
            credentials: "same-origin",
            cache: "no-store",
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
          },
        );
        const result = ingredientResponseSchema.safeParse(await response.json());
        if (!response.ok || !result.success) throw new Error("Ingredients unavailable");
        if (!controller.signal.aborted) setData(result.data.data);
      } catch {
        if (!controller.signal.aborted) setError(true);
      }
    }
    void load();
    return () => controller.abort();
  }, [productId, baumannType, reportId, revision]);
  const searched = normalizeIngredient(query.trim());
  const matches = (name: string) =>
    Boolean(searched) && normalizeIngredient(name).includes(searched);
  return (
    <section aria-label="제품 전성분 분석" className="space-y-4 break-keep">
      <h3 className="text-base font-semibold">전성분 &amp; 맞춤 성분 분석</h3>
      {error ? (
        <div
          role="alert"
          className="space-y-3 rounded-xl bg-status-danger-surface p-3 text-sm text-status-danger"
        >
          <p>성분 정보를 불러오지 못했습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.</p>
          <button
            className="button-secondary"
            type="button"
            onClick={() => setRevision((n) => n + 1)}
          >
            성분 정보 다시 시도
          </button>
        </div>
      ) : !data ? (
        <div
          aria-busy="true"
          role="status"
          aria-label="성분 정보 확인 중"
          className="space-y-3 motion-safe:animate-pulse"
        >
          <div className="h-16 rounded-xl bg-surface-muted" />
          <div className="flex gap-2">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-8 flex-1 rounded-xl bg-surface-muted" />
            ))}
          </div>
          <p className="text-sm text-neutral-600">성분 정보를 확인하고 있어요...</p>
        </div>
      ) : (
        <>
          {data.isDemo && (
            <p className="rounded-xl bg-primary-50 p-3 text-sm text-primary-800">
              가상 상품의 성분 예시입니다. 실제 판매 상품의 전성분이나 적합성을 검증한 결과가
              아닙니다.
            </p>
          )}
          <p className="text-sm text-neutral-700">
            {data.targetBaumannType
              ? `${data.targetBaumannType} · ${data.typeSource === "REPORT" ? "본인 진단 기준" : "선택한 예시 타입 기준"}`
              : "피부 타입 미선택 · 공통 규칙 기준"}
          </p>
          {!data.fullIngredients.length ? (
            <div className="space-y-3 rounded-xl bg-surface-muted p-3 text-sm leading-relaxed">
              <p>전성분 상세 검증 준비 중인 상품입니다. 판매처의 공식 전성분을 확인해 주세요.</p>
              {redirectPath && (
                <a
                  className="button-secondary"
                  href={redirectPath}
                  rel="sponsored nofollow noreferrer"
                  referrerPolicy="no-referrer"
                >
                  판매처 전성분 확인
                </a>
              )}
            </div>
          ) : (
            <>
              <div className="space-y-3">
                <h4 className="text-sm font-semibold">피부 타입별 주의 성분</h4>
                {data.cautionIngredients.length ? (
                  <ul className="space-y-3">
                    {data.cautionIngredients.map((item) => (
                      <li
                        key={`${item.nameKo}-${item.matchedAxis}`}
                        className="rounded-xl bg-status-warning-surface p-3 text-sm leading-relaxed text-status-warning"
                      >
                        <p className="flex items-start gap-2 font-semibold">
                          <TriangleAlert
                            size={18}
                            strokeWidth={1.75}
                            aria-hidden="true"
                            className="mt-1 shrink-0"
                          />
                          <span aria-label={`${item.badgeText}: ${item.nameKo}`}>
                            {item.badgeText} · {item.nameKo}
                          </span>
                        </p>
                        <p className="mt-2">{item.reasonKo}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="rounded-xl bg-surface-muted p-3 text-sm leading-relaxed text-neutral-700">
                    등록된 대표 규칙에서 주의 성분이 검출되지 않았습니다. 자극이 없다는 뜻은
                    아닙니다.
                  </p>
                )}
                <p className="text-xs leading-relaxed text-neutral-600">{data.coverageNotice}</p>
              </div>
              <div className="space-y-3">
                <h4 className="text-sm font-semibold">함유 성분의 원료 특성</h4>
                {data.beneficialIngredients.length ? (
                  <ul className="space-y-3">
                    {data.beneficialIngredients.map((item) => (
                      <li
                        key={item.nameKo}
                        className="rounded-xl bg-primary-50 p-3 text-sm leading-relaxed"
                      >
                        <p className="font-semibold text-primary-900">
                          {item.nameKo}
                          {item.isTargetMatched && (
                            <span className="ml-2 text-xs font-normal">진단 추천과 일치</span>
                          )}
                        </p>
                        <p className="mt-1 text-neutral-700">{item.functionSummary}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm leading-relaxed text-neutral-600">
                    등록된 원료 설명과 일치하는 성분이 없습니다. 아래 전성분과 공식 제품 표시를
                    확인해 주세요.
                  </p>
                )}
              </div>
              <div className="space-y-3">
                <h4 className="text-sm font-semibold">
                  전성분 전체 · {data.fullIngredients.length}개
                </h4>
                <p className="text-xs leading-relaxed text-neutral-600">
                  등록된 표시 순서를 유지합니다. 농도와 완제품의 효과를 뜻하지 않습니다.
                </p>
                <label className="block space-y-2 text-sm">
                  <span>전성분 검색</span>
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="min-h-11 w-full rounded-xl border border-neutral-300 bg-surface px-3 py-2"
                    placeholder="성분 이름을 입력해 주세요"
                  />
                </label>
                {searched && (
                  <p role="status" className="text-xs text-neutral-600">
                    {data.fullIngredients.filter(matches).length}개 일치 · 표시 순서를 유지하며
                    강조합니다.
                  </p>
                )}
                <ol
                  aria-label="등록된 전성분 순서"
                  className="list-inside list-decimal space-y-1 text-sm leading-relaxed text-neutral-700"
                >
                  {data.fullIngredients.map((name, i) => (
                    <li key={`${i}-${name}`}>
                      {matches(name) ? (
                        <mark className="rounded bg-primary-100 px-1 text-primary-900">{name}</mark>
                      ) : (
                        name
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
export function IngredientRegulatoryNotice() {
  return <p className="text-xs leading-relaxed text-neutral-600">{ingredientRegulatoryNotice}</p>;
}
