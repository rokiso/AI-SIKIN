import priceExamples from "@/data/procedure-prices/2026-11-23/public-examples.json";
import {
  formatPriceMean,
  formatProcedurePrice,
  type ProcedureView,
} from "@/lib/catalog/procedures";
type PriceExample = {
  option: string;
  amountsKrw: number[];
  offerEndsOn?: string;
  taxUnconfirmed?: boolean;
};

const examplesByCode: Record<
  string,
  { comparisonNote: string; examples: PriceExample[] } | undefined
> = priceExamples.procedures;

function formatExample(example: PriceExample) {
  const min = Math.min(...example.amountsKrw);
  const max = Math.max(...example.amountsKrw);
  return min === max ? formatPriceMean(min) : `${formatPriceMean(min)} ~ ${formatPriceMean(max)}`;
}

export function ProcedurePrice({
  procedure,
  detail = false,
}: {
  procedure: Pick<ProcedureView, "priceMinKrw" | "priceMaxKrw" | "priceSummary"> &
    Partial<Pick<ProcedureView, "code">>;
  detail?: boolean;
}) {
  const summary = procedure.priceSummary;
  const pricing = procedure.code ? examplesByCode[procedure.code] : undefined;
  const previewExample = pricing?.examples[0];
  return (
    <div className="space-y-1">
      {pricing && <p className="text-xs font-medium text-neutral-700">플랫폼 공개 가격 표본</p>}
      <p className="text-base font-semibold text-neutral-900">{formatProcedurePrice(procedure)}</p>
      {summary.status === "AVAILABLE" && summary.meanKrw !== null ? (
        <>
          {summary.sampleCount === 1 ? (
            <div className="text-sm leading-relaxed text-neutral-700">
              <p>공개 가격 자료 1건</p>
              <p className="text-xs text-neutral-600">
                가격 범위를 판단하기에는 자료가 부족합니다.
              </p>
            </div>
          ) : procedure.priceMinKrw === procedure.priceMaxKrw ? (
            <p className="text-sm leading-relaxed text-neutral-700">
              공개 가격 자료 {summary.sampleCount}건 · 확인한 가격이 모두 같습니다.
            </p>
          ) : (
            <p className="text-sm text-neutral-700">
              수집 표본 평균 {formatPriceMean(summary.meanKrw)} · {summary.sampleCount}건
            </p>
          )}
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
      {pricing && previewExample && (
        <div className="mt-3 space-y-2 border-t border-neutral-200 pt-3">
          <p className="text-sm font-semibold text-neutral-900">옵션별 공개 가격 예시</p>
          {detail ? (
            <>
              <p className="text-xs leading-relaxed text-neutral-600">
                {priceExamples.observedOn} 확인 · 세금 표기가 있는 항목은 부가세 포함 금액입니다.
                공개 가격표와 행사에서 확인한 예시이며, 적용 조건과 추가비용은 달라질 수 있어요.
              </p>
              <dl className="divide-y divide-neutral-200">
                {pricing.examples.map((example) => (
                  <div
                    key={example.option}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2"
                  >
                    <dt className="text-sm text-neutral-700">
                      {example.option}
                      {example.offerEndsOn && (
                        <span className="block text-xs">행사 종료일 {example.offerEndsOn}</span>
                      )}
                    </dt>
                    <dd className="text-sm font-semibold tabular-nums text-neutral-900">
                      {formatExample(example)}
                      {example.amountsKrw.length > 1 && (
                        <span className="ml-1 text-xs font-normal text-neutral-600">
                          ({example.amountsKrw.length}건)
                        </span>
                      )}
                      {example.taxUnconfirmed && (
                        <span className="block text-xs font-normal text-neutral-600">
                          고지 금액
                        </span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="text-xs leading-relaxed text-neutral-700">{pricing.comparisonNote}</p>
            </>
          ) : (
            <div className="space-y-1 text-xs leading-relaxed text-neutral-700">
              <p>
                {previewExample.option} ·{" "}
                <span className="font-semibold">{formatExample(previewExample)}</span>
              </p>
              <p>상세에서 가격 옵션 {pricing.examples.length}개 비교</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
