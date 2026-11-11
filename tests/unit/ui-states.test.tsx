import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ErrorBoundary from "@/app/error";
import Loading from "@/app/loading";
import { EmptyState } from "@/components/ui/EmptyState";
import { MedicalDisclaimerNotice } from "@/components/layout/MedicalDisclaimerNotice";
import { SessionProvider, useAppUserSession } from "@/components/session/SessionProvider";

afterEach(cleanup);

describe("global state boundaries", () => {
  it("announces loading without taking focus", () => {
    render(<Loading />);
    expect(screen.getByRole("status").textContent).toContain("피부 데이터를 안전하게 불러오는 중입니다...");
    expect(document.activeElement).toBe(document.body);
  });

  it("shows a safe error with reload and home recovery", () => {
    render(<ErrorBoundary />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    expect(screen.getByRole("button", { name: "새로고침" })).toBeDefined();
    expect(screen.getByRole("link", { name: "홈으로 이동" }).getAttribute("href")).toBe("/");
  });

  it("provides diagnosis as a meaningful action when no reports exist", () => {
    render(<EmptyState />);
    expect(screen.getByRole("heading").textContent).toBe("아직 기록된 피부 분석 리포트가 없습니다.");
    expect(screen.getByRole("link", { name: "피부 진단 시작하기" }).getAttribute("href")).toBe("/diagnostic");
  });

  it("always includes the complete disclaimer", () => {
    render(<MedicalDisclaimerNotice />);
    expect(screen.getByRole("complementary", { name: "서비스 이용 안내" }).textContent).toContain("본 서비스의 분석 및 추천 결과는 의료 진단이나 치료를 대체할 수 없으며, 일상 스킨케어 관리를 위한 가이드입니다.");
  });
});

describe("guest session context", () => {
  function SessionProbe() {
    const session = useAppUserSession();
    return <output>{JSON.stringify(session)}</output>;
  }

  it("makes the server-provided guest shape available without inventing a logged-in identity", () => {
    const guest = { isAuthenticated: false, userId: null, role: "guest" as const, guestDeviceId: "4b579c57-a36b-449f-aecc-7459783b82da" };
    render(<SessionProvider session={guest}><SessionProbe /></SessionProvider>);
    expect(JSON.parse(screen.getByRole("status").textContent ?? "null")).toEqual(guest);
  });

  it("does not silently treat a missing provider as an authenticated session", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<SessionProbe />)).toThrow("useAppUserSession requires SessionProvider");
    consoleError.mockRestore();
  });
});
