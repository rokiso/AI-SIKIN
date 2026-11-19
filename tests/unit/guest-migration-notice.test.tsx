import { cleanup, fireEvent, render, screen, act } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { GuestMigrationNotice } from "@/components/auth/GuestMigrationNotice";
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("announces confirmed migration, then dismisses without navigation or focus changes", () => {
  vi.useFakeTimers();
  render(<GuestMigrationNotice />);
  expect(screen.getByRole("status", { name: "기록 연결 완료" }).textContent).toContain(
    "안전하게 연결되었습니다",
  );
  act(() => vi.advanceTimersByTime(3000));
  expect(screen.queryByRole("status")).toBeNull();
});
it("lets the member dismiss the notice immediately", () => {
  render(<GuestMigrationNotice />);
  fireEvent.click(screen.getByRole("button", { name: "연결 완료 안내 닫기" }));
  expect(screen.queryByRole("status")).toBeNull();
});
