import { cleanup, fireEvent, render, screen, act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { procedureSafetySeeds } from "@/prisma/seeds/procedure-safety";
import { procedureGuides } from "@/prisma/seeds/procedures";
import {
  formatDefenseQuestions,
  procedureSafetyRoutes,
} from "@/lib/catalog/procedure-safety-types";
import { ChecklistClipboardButton } from "@/components/catalog/ChecklistClipboardButton";
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("procedure safety content and defense checklist", () => {
  it("covers the same ten existing procedures without introducing branded procedure replacements", () => {
    expect(procedureSafetySeeds.map((g) => g.code)).toEqual(procedureGuides.map((g) => g.code));
    expect(new Set(procedureSafetyRoutes.map((r) => r.slug)).size).toBe(10);
    for (const row of procedureSafetySeeds) {
      expect(row.commonSideEffects.length).toBeGreaterThan(0);
      expect(row.rareRisks.length).toBeGreaterThan(0);
      expect(row.postCareInstructions).toHaveLength(3);
      expect(row.defenseQuestions).toHaveLength(3);
      expect(JSON.stringify(row)).not.toMatch(
        /예약하기|전화예약|원장님|https?:\/\/|무조건|부작용 없음|100%/,
      );
      expect(row.disclaimerText).toContain("개인의 적응증·금기를 판정하거나");
    }
  });
  it("formats the full named checklist with three numbered questions and its footer", () => {
    const row = procedureSafetySeeds[0];
    const text = formatDefenseQuestions("피코레이저 토닝", row.defenseQuestions);
    expect(text.startsWith("[피부과 상담 과잉 진료 방어 질문지 - 피코레이저 토닝]\n1. ")).toBe(
      true,
    );
    expect(text).toContain("\n2. ");
    expect(text).toContain("\n3. ");
    expect(text.endsWith("* 본 질문지는 객관적 정보 확인을 위한 가이드입니다.")).toBe(true);
    expect(() => formatDefenseQuestions("검증", row.defenseQuestions.slice(0, 2))).toThrow();
  });
  it("keeps urgent injection warning language and never invents universal treatment timing", () => {
    const ha = procedureSafetySeeds.find((r) => r.code === "P-HA")!;
    expect(ha.postCareInstructions.join(" ")).toMatch(/시야 변화.*즉시 진료/);
    expect(JSON.stringify(procedureSafetySeeds)).not.toMatch(
      /SPF 50|최소 7일|1주일간.*중단|임산부.*금지/,
    );
  });
  it("copies the defense format and announces success for three seconds", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const questions = procedureSafetySeeds[0].defenseQuestions;
    const text = formatDefenseQuestions("검증 시술", questions);
    render(
      <ChecklistClipboardButton
        variant="defense"
        questions={questions.map((q) => q.question)}
        copyText={text}
      />,
    );
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "상담 질문지 복사하기" })),
    );
    expect(writeText).toHaveBeenCalledWith(text);
    expect(screen.getByRole("status").textContent).toBe("상담 체크리스트가 복사되었습니다.");
    act(() => vi.advanceTimersByTime(2999));
    expect(screen.getByRole("button", { name: "복사 완료" })).toBeDefined();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("button", { name: "상담 질문지 복사하기" })).toBeDefined();
  });
  it("keeps a selectable full checklist when copying is denied", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("Denied")) },
    });
    const qs = procedureSafetySeeds[0].defenseQuestions,
      text = formatDefenseQuestions("검증", qs);
    render(
      <ChecklistClipboardButton
        variant="defense"
        questions={qs.map((q) => q.question)}
        copyText={text}
      />,
    );
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "상담 질문지 복사하기" })),
    );
    expect(screen.getByRole("status").textContent).toContain("직접 복사");
    expect(screen.getByRole("textbox").getAttribute("readonly")).not.toBeNull();
    expect(screen.getByRole("textbox").textContent).toBe(text);
  });
});
