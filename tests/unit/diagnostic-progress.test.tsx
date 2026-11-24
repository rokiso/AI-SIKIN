import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
import { useDiagnosticProgress } from "@/hooks/useDiagnosticProgress";
import { markAnalysisIntent } from "@/lib/api/diagnosticProgressIntent";
const sessionId = "11111111-1111-4111-8111-111111111111";
const reportId = "22222222-2222-4222-8222-222222222222";
class Source {
  static CLOSED = 2;
  static instances: Source[] = [];
  readyState = 0;
  onopen?: () => void;
  onerror?: (event: Event) => void;
  handlers = new Map<string, (event: Event) => void>();
  close = vi.fn(() => {
    this.readyState = 2;
  });
  constructor(public url: string) {
    Source.instances.push(this);
  }
  addEventListener(type: string, handle: (event: Event) => void) {
    this.handlers.set(type, handle);
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  event(type: string, data: unknown) {
    const event = new MessageEvent(type, { data: JSON.stringify(data) });
    if (type === "error") this.onerror?.(event);
    else this.handlers.get(type)?.(event);
  }
}
beforeEach(() => {
  Source.instances = [];
  router.replace.mockClear();
  router.refresh.mockClear();
  vi.stubGlobal("EventSource", Source);
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const progress = (stepNumber: 1 | 2 | 3, skipped = false) => ({
  step: ["EXTRACTING_FEATURES", "COMBINING_SURVEY", "GENERATING_REPORT"][stepNumber - 1],
  stepNumber,
  progressPercent: [35, 70, 95][stepNumber - 1],
  message: "서버가 보낸 실제 처리 단계",
  skipped,
});
describe("diagnostic progress stream client", () => {
  it("does not start a new paid analysis merely from a direct progress link and closes on unmount", () => {
    const { unmount } = renderHook(() => useDiagnosticProgress(sessionId));
    act(() => Source.instances[0].open());
    expect(fetch).not.toHaveBeenCalled();
    unmount();
    expect(Source.instances[0].close).toHaveBeenCalled();
  });
  it("consumes a user action once, applies actual steps monotonically and closes before navigation", async () => {
    vi.useFakeTimers();
    markAnalysisIntent(sessionId);
    vi.mocked(fetch).mockResolvedValue(
      Response.json(
        { success: true, data: { status: "ANALYSIS_PENDING", sessionId } },
        { status: 202 },
      ),
    );
    const { result } = renderHook(() => useDiagnosticProgress(sessionId));
    await act(async () => Source.instances[0].open());
    expect(fetch).toHaveBeenCalledTimes(1);
    act(() => {
      Source.instances[0].event("progress", progress(1, true));
      Source.instances[0].event("progress", progress(2));
      Source.instances[0].event("progress", progress(1));
    });
    expect(result.current.step?.stepNumber).toBe(2);
    expect(result.current.photoSkipped).toBe(true);
    act(() => Source.instances[0].event("progress", progress(3)));
    act(() =>
      Source.instances[0].event("complete", {
        reportId,
        baumannType: "DRNT",
        isFallback: false,
        completedAt: "2026-11-18T00:00:00.000Z",
      }),
    );
    expect(Source.instances[0].close).toHaveBeenCalled();
    act(() => vi.runOnlyPendingTimers());
    expect(router.replace).toHaveBeenCalledWith(`/diagnostic/result/${reportId}`);
  });
  it("shows a truthful questionnaire fallback and routes within one second", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useDiagnosticProgress(sessionId));
    act(() =>
      Source.instances[0].event("fallback", {
        reportId,
        reason: "TIMEOUT",
        message: "사진 AI 응답이 지연되어 문진 기반 참고 리포트로 전환했어요.",
      }),
    );
    expect(result.current.notice).toContain("문진 기반");
    expect(result.current.phase).toBe("COMPLETE");
    act(() => vi.advanceTimersByTime(200));
    expect(router.replace).toHaveBeenCalledWith(`/diagnostic/result/${reportId}`);
  });
  it("reconnects at most twice and offers explicit recovery without automatic duplicate POSTs", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useDiagnosticProgress(sessionId));
    for (let i = 0; i < 3; i++) {
      act(() => Source.instances[i].onerror?.(new Event("error")));
      await act(async () => vi.advanceTimersByTime(1000));
    }
    expect(Source.instances).toHaveLength(3);
    expect(result.current.error).toContain("실시간으로 불러오지 못했습니다");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not navigate to unvalidated stream IDs and treats malformed events as failures", () => {
    const { result } = renderHook(() => useDiagnosticProgress(sessionId));
    act(() => Source.instances[0].event("complete", { reportId: "https://evil.test" }));
    expect(result.current.phase).toBe("ERROR");
    expect(router.replace).not.toHaveBeenCalled();
  });
  it("asks for a new questionnaire when the saved answers are incomplete", async () => {
    markAnalysisIntent(sessionId);
    vi.mocked(fetch).mockResolvedValue(
      Response.json({ error: { code: "INCOMPLETE_SURVEY_DATA" } }, { status: 400 }),
    );
    const { result } = renderHook(() => useDiagnosticProgress(sessionId));
    await act(async () => Source.instances[0].open());
    expect(result.current.phase).toBe("RESTART_REQUIRED");
    expect(result.current.error).toContain("문진을 다시 진행");
    expect(Source.instances[0].close).toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });
  it("exposes a safe POST failure and allows retry to the same saved session", async () => {
    markAnalysisIntent(sessionId);
    vi.mocked(fetch).mockResolvedValue(Response.json({ success: false }, { status: 503 }));
    const { result } = renderHook(() => useDiagnosticProgress(sessionId));
    act(() => Source.instances[0].open());
    await waitFor(() => expect(result.current.phase).toBe("ERROR"));
    expect(result.current.error).toContain("피부 분석을 완료하지 못했습니다");
    act(() => result.current.checkStatus());
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(
      vi
        .mocked(fetch)
        .mock.calls.every((call) => JSON.parse(String(call[1]?.body)).sessionId === sessionId),
    ).toBe(true);
  });
});
