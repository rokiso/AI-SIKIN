"use client";
import { useId, useState } from "react";
import {
  formatPriceMean,
  formatProcedurePrice,
  type ProcedureView,
} from "@/lib/catalog/procedures";
export function ProcedurePrice({
  procedure,
  detail = false,
}: {
  procedure: Pick<ProcedureView, "priceMinKrw" | "priceMaxKrw" | "priceSummary" | "priceOptions">;
  detail?: boolean;
}) {
  const selectId = useId();
  const [selectedBasis, setSelectedBasis] = useState<string | null>(null);
  const active =
    detail && selectedBasis
      ? (procedure.priceOptions?.find((option) => option.priceSummary.basis === selectedBasis) ??
        procedure)
      : procedure;
  const summary = active.priceSummary;
  const options = procedure.priceOptions ?? [];
  return (
    <div className="space-y-1">
      {detail && options.length > 1 && (
        <div className="mb-3 space-y-2">
          <label htmlFor={selectId} className="block text-sm font-semibold">
            가격 비교 조건
          </label>
          <select
            id={selectId}
            value={summary.basis ?? ""}
            onChange={(event) => setSelectedBasis(event.target.value)}
            className="min-h-11 w-full min-w-0 max-w-full rounded-xl border border-neutral-300 bg-surface px-3 py-2 text-sm text-neutral-900"
          >
            {options.map((option) => (
              <option key={option.priceSummary.basis} value={option.priceSummary.basis ?? ""}>
                {option.priceSummary.basis?.split(" · 쿠폰")[0]}
              </option>
            ))}
          </select>
          <p className="text-xs leading-relaxed text-neutral-600">
            장비·용량·샷 수·부위가 다른 가격은 따로 비교해요. 미기재된 조건과 실제 결제 총액은 상담
            시 확인해 주세요.
          </p>
        </div>
      )}
      <div aria-live={detail ? "polite" : undefined} aria-atomic="true">
        <p className="text-base font-semibold text-neutral-900">{formatProcedurePrice(active)}</p>
        {summary.status === "AVAILABLE" && summary.meanKrw !== null ? (
          <>
            {summary.sampleCount === 1 ? (
              <div className="text-sm leading-relaxed text-neutral-700">
                <p>공개 가격 자료 1건</p>
                <p className="text-xs text-neutral-600">
                  가격 범위를 판단하기에는 자료가 부족합니다.
                </p>
              </div>
            ) : active.priceMinKrw === active.priceMaxKrw ? (
              <p className="text-sm leading-relaxed text-neutral-700">
                공개 가격 자료 {summary.sampleCount}건 · 확인한 가격이 모두 같습니다.
              </p>
            ) : (
              <p className="text-sm text-neutral-700">
                수집 표본 평균 {formatPriceMean(summary.meanKrw)} · {summary.sampleCount}건
              </p>
            )}
            <p className="text-xs leading-relaxed text-neutral-600">
              {summary.basis} · 부가세 포함
            </p>
            {detail && (
              <p className="text-xs leading-relaxed text-neutral-600">
                {summary.platforms.join("·")} 공개 자료 · {summary.observedFrom} ~{" "}
                {summary.observedThrough} 확인. 수집한 이벤트 가격의 표본으로, 전국 평균이나 실제
                결제 금액을 뜻하지 않습니다. 첫 방문·기간 등 적용 조건을 별도로 확인해 주세요.
              </p>
            )}
          </>
        ) : (
          <p className="text-xs leading-relaxed text-neutral-600">
            같은 조건의 공개 가격 자료를 확인한 뒤 평균과 범위를 안내합니다.
          </p>
        )}
      </div>
      {!detail && options.length > 1 && (
        <p className="text-xs text-primary-800">
          가격 비교 조건 {options.length}종 · 상세에서 확인
        </p>
      )}
    </div>
  );
}
