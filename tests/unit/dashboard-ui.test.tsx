import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DashboardSummary } from "@/lib/dashboard/types";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { DashboardFailure } from "@/components/dashboard/DashboardFailure";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
afterEach(() => { cleanup(); refresh.mockReset(); });

const emptySummary: DashboardSummary = {
  hasDiagnosticHistory: false,
  user: { isAuthenticated: false, nickname: null },
  latestDiagnostic: null,
  todaySnapshot: { isRecorded: false, snapshotId: null, recordDate: "2026-11-10", feedbackComment: null, conditions: null },
};

const returningSummary: DashboardSummary = {
  hasDiagnosticHistory: true,
  user: { isAuthenticated: true, nickname: "검증 사용자" },
  latestDiagnostic: {
    reportId: "report-test", baumannType: "OSNW", baumannNameKo: "지성 민감 비색소성 주름 피부",
    diagnosedAt: "2026-11-09T16:00:00.000Z", summary: "저장된 피부 상태 설명",
    recommendedIngredients: ["저장된 권장 성분"], cautionIngredients: ["저장된 주의 성분"],
    axisScores: { oiliness: 65, sensitivity: 40, pigmentation: 20, elasticity: 35 },
  },
  todaySnapshot: { isRecorded: false, snapshotId: null, recordDate: "2026-11-10", feedbackComment: null, conditions: null },
};

describe("dashboard screen states", () => {
  it("guides a new guest to diagnosis and each real destination", () => {
    render(<DashboardView summary={emptySummary} />);
    expect(screen.getByRole("link", { name: "무료 AI 피부 진단 시작하기" }).getAttribute("href")).toBe("/diagnostic");
    expect(screen.getByText("정밀 피부 분석(바우만 16타입)")).toBeDefined();
    expect(screen.getByRole("navigation", { name: "맞춤 관리 바로가기" }).querySelectorAll("a")).toHaveLength(3);
    expect(screen.queryByText("오늘 스냅샷 남기기")).toBeNull();
  });

  it("renders only the supplied report values and a member's unrecorded snapshot action", () => {
    render(<DashboardView summary={returningSummary} />);
    expect(screen.getByText("OSNW")).toBeDefined();
    expect(screen.getByText("저장된 권장 성분")).toBeDefined();
    expect(screen.getByText("저장된 주의 성분")).toBeDefined();
    expect(screen.getAllByRole("meter")).toHaveLength(4);
    expect(screen.getByRole("meter", { name: "유분 지표" }).getAttribute("aria-valuenow")).toBe("65");
    expect(screen.getByRole("link", { name: "오늘 스냅샷 남기기" }).getAttribute("href")).toBe("/snapshot");
  });

  it("shows the stored daily comment and conditions after recording", () => {
    render(<DashboardView summary={{ ...returningSummary, todaySnapshot: { isRecorded: true, snapshotId: "snapshot-test", recordDate: "2026-11-10", feedbackComment: "저장된 오늘의 피부 피드백", conditions: { hydrationLevel: "BALANCED", soothingLevel: "HIGH", sebumLevel: "LOW" } } }} />);
    expect(screen.getByText("오늘의 피부 기록 완료")).toBeDefined();
    expect(screen.getByText("저장된 오늘의 피부 피드백")).toBeDefined();
    expect(screen.queryByText("오늘 스냅샷 남기기")).toBeNull();
  });

  it("keeps missing ingredient data honest instead of inventing recommendations", () => {
    if (!returningSummary.latestDiagnostic) throw new Error("Report fixture missing");
    render(<DashboardView summary={{ ...returningSummary, latestDiagnostic: { ...returningSummary.latestDiagnostic, recommendedIngredients: [], cautionIngredients: [] } }} />);
    expect(screen.getByText("권장 성분 정보가 아직 등록되지 않았어요.")).toBeDefined();
    expect(screen.getByText("등록된 주의 성분 정보가 없어요.")).toBeDefined();
  });

  it("announces loading, and gives a refresh action after a safe failure", () => {
    const loading = render(<DashboardSkeleton />);
    expect(screen.getByRole("status").textContent).toContain("대시보드 정보를 불러오는 중입니다.");
    loading.unmount();
    render(<DashboardFailure />);
    expect(screen.getByRole("alert").textContent).toContain("대시보드 정보를 불러오지 못했습니다.");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(refresh).toHaveBeenCalledOnce();
  });
});
