import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ProcedurePrice } from "@/components/catalog/ProcedurePrice";
import { summarizeProcedurePrices } from "@/lib/catalog/procedure-pricing";
afterEach(cleanup);
const basis = "테스트 전용 동일 조건";
const observation = {
  platform: "YEOSHIN" as const,
  sourceUrl: "https://www.yeoshin.co.kr/test-fixture",
  sampleKey: "a".repeat(64),
  amountKrw: 50000,
  vatIncluded: true,
  observedOn: "2026-11-18",
  basis,
};
it("labels a deduplicated single price honestly without a range or sample average", () => {
  const price = summarizeProcedurePrices([observation, observation], basis, "2026-11-19");
  render(<ProcedurePrice procedure={price} detail />);
  expect(screen.getByText("확인된 가격 50,000원")).toBeDefined();
  expect(screen.getByText("공개 가격 자료 1건")).toBeDefined();
  expect(screen.getByText("가격 범위를 판단하기에는 자료가 부족합니다.")).toBeDefined();
  expect(screen.queryByText(/수집 표본 평균/)).toBeNull();
  expect(screen.queryByText("50,000원 ~ 50,000원")).toBeNull();
});
it("shows one confirmed price when multiple independent observations agree", () => {
  const price = summarizeProcedurePrices(
    [observation, { ...observation, sampleKey: "b".repeat(64) }],
    basis,
    "2026-11-19",
  );
  render(<ProcedurePrice procedure={price} />);
  expect(screen.getByText("확인된 가격 50,000원")).toBeDefined();
  expect(screen.getByText("공개 가격 자료 2건 · 확인한 가격이 모두 같습니다.")).toBeDefined();
  expect(screen.queryByText(/수집 표본 평균/)).toBeNull();
});
it("retains actual collected ranges and sample arithmetic for different prices", () => {
  const price = summarizeProcedurePrices(
    [observation, { ...observation, sampleKey: "b".repeat(64), amountKrw: 70000 }],
    basis,
    "2026-11-19",
  );
  render(<ProcedurePrice procedure={price} />);
  expect(screen.getByText("50,000원 ~ 70,000원")).toBeDefined();
  expect(screen.getByText("수집 표본 평균 60,000원 · 2건")).toBeDefined();
});

it("shows the 12-minute LDM examples independently of the platform estimate", () => {
  const price = summarizeProcedurePrices([observation], basis, "2026-11-19");
  render(<ProcedurePrice procedure={{ ...price, code: "P-LDM" }} detail />);
  expect(screen.getByText("확인된 가격 50,000원")).toBeDefined();
  expect(screen.getByText("LDM 12분 1회 · 장비 모델 확인 필요")).toBeDefined();
  expect(screen.getByText("77,000원 ~ 110,000원")).toBeDefined();
  expect(screen.getByText("옵션별 공개 가격 예시")).toBeDefined();
});
