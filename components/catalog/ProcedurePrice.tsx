import {
  formatPriceMean,
  formatProcedurePrice,
  type ProcedureView,
} from "@/lib/catalog/procedures";
export function ProcedurePrice({
  procedure,
  detail = false,
}: {
  procedure: ProcedureView;
  detail?: boolean;
}) {
  const summary = procedure.priceSummary;
  return (
    <div className="space-y-1">
      <p className="text-base font-semibold text-neutral-900">{formatProcedurePrice(procedure)}</p>
      {summary.status === "AVAILABLE" && summary.meanKrw !== null ? (
        <>
          <p className="text-sm text-neutral-700">
            수집 표본 평균 {formatPriceMean(summary.meanKrw)} · {summary.sampleCount}건
          </p>
          <p className="text-xs leading-relaxed text-neutral-600">{summary.basis} · 부가세 포함</p>
          {detail && (
            <p className="text-xs leading-relaxed text-neutral-600">
              {summary.platforms.join("·")} 공개 자료 · {summary.observedFrom} ~{" "}
              {summary.observedThrough} 확인. 수집한 이벤트 가격의 표본으로, 전국 평균이나 실제 결제
              금액을 뜻하지 않습니다. 첫 방문·기간 등 적용 조건을 별도로 확인해 주세요.
            </p>
          )}
        </>
      ) : (
        <p className="text-xs leading-relaxed text-neutral-600">
          같은 조건의 공개 가격 자료를 확인한 뒤 평균과 범위를 안내합니다.
        </p>
      )}
    </div>
  );
}
