import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProcedureGuide, ProcedureSkeletons } from "@/components/catalog/ProcedureGuide";
import { ChecklistClipboardButton } from "@/components/catalog/ChecklistClipboardButton";
import { type ProcedureView } from "@/lib/catalog/procedures";
const state = vi.hoisted(() => ({ query: new URLSearchParams() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => state.query }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  state.query = new URLSearchParams();
  vi.useRealTimers();
});
const questions = ["질문 하나?", "질문 둘?", "질문 셋?"];
const guide: ProcedureView = {
  id: "11111111-1111-4111-8111-111111111111",
  code: "P-TEST",
  nameKo: "테스트 시술",
  aliases: [],
  concernType: "PIGMENTATION",
  concernLabelKo: "색소·잡티",
  principleDescription: "테스트 원리",
  recommendedInterval: "상담 필요",
  sideEffectsWarning: "자극 주의",
  recoveryPeriod: "개인차 있음",
  checklistQuestions: questions,
  priceMinKrw: null,
  priceMaxKrw: null,
  priceSummary: {
    status: "UNVERIFIED",
    meanKrw: null,
    sampleCount: 0,
    basis: null,
    observedFrom: null,
    observedThrough: null,
    platforms: [],
  },
};
describe("procedure guide states", () => {
  it("shows four skeletons and an announced loading state", () => {
    render(<ProcedureSkeletons />);
    expect(screen.getByRole("status").querySelectorAll('[aria-hidden="true"]')).toHaveLength(4);
  });
  it("handles filtered empty data and offers an all-procedure reset", () => {
    state.query = new URLSearchParams("concern=ELASTICITY");
    render(<ProcedureGuide initialData={[guide]} />);
    expect(
      screen.getByText("선택한 피부 고민에 해당하는 표준 시술 정보가 없습니다."),
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "전체 시술 보기" })).toBeDefined();
  });
  it("explains invalid filters and shows the full catalog", () => {
    state.query = new URLSearchParams("concern=UNKNOWN");
    render(<ProcedureGuide initialData={[guide]} />);
    expect(
      screen.getByText("알 수 없는 피부 고민 필터입니다. 전체 시술을 표시합니다."),
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "테스트 시술 상세 보기" })).toBeDefined();
  });
  it("shows a safe error, loading on retry, and recovered data", async () => {
    let finish: (value: Response) => void = () => {
      throw new Error("Request not started");
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      ),
    );
    render(<ProcedureGuide initialData={null} />);
    expect(screen.getByRole("alert").textContent).toContain(
      "시술 가이드 정보를 불러오지 못했습니다.",
    );
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(screen.getByRole("status").textContent).toContain("불러오는 중");
    finish(Response.json({ success: true, data: { total: 1, procedures: [guide] } }));
    await screen.findByRole("button", { name: "테스트 시술 상세 보기" });
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("keeps retry failures visible rather than showing fake results", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network")));
    render(<ProcedureGuide initialData={null} />);
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await screen.findByRole("alert");
    expect(screen.queryByRole("button", { name: "테스트 시술 상세 보기" })).toBeNull();
  });
});
describe("consultation clipboard", () => {
  it("copies newline-separated questions and announces success for two seconds", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<ChecklistClipboardButton questions={questions} />);
    fireEvent.click(screen.getByRole("button", { name: "상담 체크리스트 복사" }));
    await screen.findByRole("button", { name: "복사 완료" });
    expect(writeText).toHaveBeenCalledWith(questions.join("\n"));
    expect(screen.getByRole("status").textContent).toContain("3문항이 복사되었습니다");
    await waitFor(
      () => expect(screen.getByRole("button", { name: "상담 체크리스트 복사" })).toBeDefined(),
      { timeout: 3000 },
    );
  });
  it.each(["denied", "unsupported"])(
    "provides selectable text without false success when %s",
    async (mode) => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value:
          mode === "unsupported"
            ? undefined
            : { writeText: vi.fn().mockRejectedValue(new Error("Denied")) },
      });
      render(<ChecklistClipboardButton questions={questions} />);
      fireEvent.click(screen.getByRole("button", { name: "상담 체크리스트 복사" }));
      const field = await screen.findByRole("textbox", { name: "직접 복사할 상담 질문" });
      expect(field).toBeInstanceOf(HTMLTextAreaElement);
      if (!(field instanceof HTMLTextAreaElement)) throw new Error("Textarea missing");
      expect(field.value).toBe(questions.join("\n"));
      await waitFor(() => {
        expect(field.selectionStart).toBe(0);
        expect(field.selectionEnd).toBe(field.value.length);
      });
      expect(screen.queryByRole("button", { name: "복사 완료" })).toBeNull();
    },
  );
});
