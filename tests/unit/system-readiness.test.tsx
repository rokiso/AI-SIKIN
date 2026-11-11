import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SystemReadiness } from "@/components/system/SystemReadiness";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const unavailableMessage = "서비스 초기화 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";

describe("system initialization feedback", () => {
  it("announces an in-flight readiness request", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    render(<SystemReadiness />);
    expect(screen.getByRole("status").textContent).toContain("서비스 연결을 확인하고 있어요.");
  });

  it("clears the pending notice only after a successful database readiness response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true, data: { status: "pass", database: "connected" },
    })));
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<SystemReadiness />);
    await waitFor(() => expect(container.textContent).toBe(""));
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/health", expect.objectContaining({ cache: "no-store" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it.each([
    { label: "503 database failure", body: { success: false, error: { code: "DATABASE_UNAVAILABLE" } }, status: 503 },
    { label: "incomplete success payload", body: { success: true, data: { status: "pass" } }, status: 200 },
    { label: "unready database payload", body: { success: true, data: { status: "fail", database: "disconnected" } }, status: 200 },
  ])("shows a reload action for $label", async ({ body, status }) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })));
    render(<SystemReadiness />);
    expect((await screen.findByRole("alert")).textContent).toContain(unavailableMessage);
    expect(screen.getByRole("button", { name: "새로고침" })).toBeDefined();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("offers recovery for network errors without showing internal exception details", async () => {
    const internalDetails = "internal-readiness-request-failure";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error(internalDetails)));
    render(<SystemReadiness />);
    const notice = await screen.findByRole("alert");
    expect(notice.textContent).toContain(unavailableMessage);
    expect(notice.textContent).not.toContain(internalDetails);
    expect(screen.getByRole("button", { name: "새로고침" })).toBeDefined();
  });
});
