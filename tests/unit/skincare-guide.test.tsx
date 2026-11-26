import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RoutineGuide } from "@/components/guide/RoutineGuide";
import { SeasonalMoistureGuide } from "@/components/guide/SeasonalMoistureGuide";

afterEach(cleanup);

describe("beginner skincare learning", () => {
  it("starts with a simple morning routine and keeps optional steps optional", () => {
    render(<RoutineGuide />);
    expect(within(screen.getByRole("status")).getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "아침" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(screen.getByRole("status")).queryByText("토너 · 선택")).toBeNull();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(within(screen.getByRole("status")).getAllByRole("listitem")).toHaveLength(5);
    expect(within(screen.getByRole("status")).getByText("토너 · 선택")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "저녁" }));
    expect(within(screen.getByRole("status")).getAllByRole("listitem")).toHaveLength(4);
    expect(
      within(screen.getByRole("status")).queryByText("자외선 차단", { exact: true }),
    ).toBeNull();
    expect(screen.getByRole("status").textContent).toContain(
      "이중 세안이 모두에게 필요한 것은 아니에요",
    );
    fireEvent.click(screen.getByRole("checkbox"));
    expect(within(screen.getByRole("status")).getAllByRole("listitem")).toHaveLength(2);
  });

  it("does not assign a skin type and explains both dryness and oiliness together", () => {
    render(<SeasonalMoistureGuide />);
    expect(screen.getByRole("status").textContent).toContain(
      "피부 타입을 지금 확정하지 않아도 괜찮아요",
    );
    fireEvent.click(screen.getByRole("radio", { name: "번들거리고 당겨요" }));
    fireEvent.click(screen.getByRole("radio", { name: "춥고 건조해요" }));
    expect(screen.getByRole("status").textContent).toContain(
      "번들거림과 건조함은 함께 느낄 수 있어요",
    );
    expect(screen.getByRole("status").textContent).toContain("난방 환경");
    expect(screen.getByRole("status").textContent).toContain("그대로 사용해도 괜찮아요");
    expect(screen.getByText(/피부 타입 진단이 아니에요/)).toBeDefined();
  });
});
