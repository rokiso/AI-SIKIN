import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({
  usePathname: () => "/diagnostic/result/test",
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
import { DiagnosticReportCard } from "@/components/diagnostic/DiagnosticReportCard";
import ReportError from "@/app/diagnostic/result/[reportId]/error";
import type { DiagnosticReportView } from "@/lib/diagnostic/report-types";
const report: DiagnosticReportView = {
  reportId: "11111111-1111-4111-8111-111111111111",
  sessionId: "22222222-2222-4222-8222-222222222222",
  baumannType: "DRNT",
  baumannNameKo: "건성 저항성 피부",
  axisScores: { oiliness: 0, sensitivity: 33, pigmentation: 50, elasticity: 100 },
  overallScore: null,
  summary: "일상 관리 참고 안내",
  recommendedIngredients: [],
  cautionIngredients: [],
  source: "QUESTIONNAIRE",
  isFallback: true,
  createdAt: "2026-11-18T00:00:00.000Z",
};
afterEach(cleanup);
it("distinguishes questionnaire, AI assisted and legacy sources without inventing a health score", () => {
  const view = render(<DiagnosticReportCard report={report} isMember />);
  expect(screen.getByText("문진 기반 참고 리포트")).toBeDefined();
  expect(screen.getByText(/사진 AI 분석을 적용하지 않았습니다/)).toBeDefined();
  expect(screen.queryByText("DRNT")).toBeNull();
  expect(screen.queryByText(/종합점수/)).toBeNull();
  expect(screen.getByText(/별도로 제안된 성분이 없습니다/)).toBeDefined();
  view.rerender(
    <DiagnosticReportCard
      report={{ ...report, source: "AI_ASSISTED", isFallback: false }}
      isMember
    />,
  );
  expect(screen.getByText("문진 + 사진 AI 참고 리포트")).toBeDefined();
  expect(screen.getByText(/문진을 최소 60% 반영/)).toBeDefined();
  view.rerender(
    <DiagnosticReportCard report={{ ...report, source: "LEGACY", isFallback: false }} isMember />,
  );
  expect(screen.getByText("이전에 저장한 리포트")).toBeDefined();
  expect(screen.getByText(/분석 방법이 기록되지 않은/)).toBeDefined();
});
it("offers retry and the saved archive after a loading failure", () => {
  const reset = vi.fn();
  render(<ReportError reset={reset} />);
  screen.getByRole("button", { name: "다시 불러오기" }).click();
  expect(reset).toHaveBeenCalledOnce();
  expect(screen.getByRole("link", { name: "보관함으로" }).getAttribute("href")).toBe("/mypage");
});
