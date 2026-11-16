import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
for (const width of [320, 1280]) {
  test(`survey keyboard, correction, failure retry and completion at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/diagnostic");
    await page.getByRole("button", { name: "문진 먼저 시작하기" }).click();
    const progress = page.getByRole("progressbar", { name: "문진 진행률" });
    await expect(progress).toHaveAttribute("value", "1");
    await expect(page.getByRole("button", { name: "이전", exact: true })).toBeDisabled();
    await page.keyboard.press("2");
    await expect(progress).toHaveAttribute("value", "2");
    await page.keyboard.press("ArrowLeft");
    await expect(progress).toHaveAttribute("value", "1");
    await expect(page.getByRole("radio").nth(1)).toBeChecked();
    await page.keyboard.press("ArrowRight");
    await expect(progress).toHaveAttribute("value", "2");
    for (let step = 2; step <= 12; step++) {
      await expect(progress).toHaveAttribute("value", String(step));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      const boxes = await page
        .locator("fieldset label")
        .evaluateAll((labels) =>
          labels.map((label) => ({
            w: label.getBoundingClientRect().width,
            h: label.getBoundingClientRect().height,
          })),
        );
      expect(boxes.every((box) => box.w >= 44 && box.h >= 44)).toBe(true);
      if (step < 12) await page.keyboard.press("3");
    }
    await expect(page.getByRole("button", { name: "문진 완료하기" })).toBeDisabled();
    await page.getByRole("radio").nth(2).check();
    const requests: {
      requestId: string;
      answers: { questionId: string; selectedChoice: number }[];
    }[] = [];
    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/v1/diagnostics/survey-answers", async (route) => {
      requests.push(route.request().postDataJSON());
      if (requests.length === 1)
        return route.fulfill({
          status: 503,
          json: { success: false, error: { code: "SURVEY_UNAVAILABLE" } },
        });
      await pending;
      return route.fulfill({
        status: 201,
        json: {
          success: true,
          data: {
            sessionId: "12345678-1234-4234-8234-123456789012",
            status: "SURVEY_COMPLETED",
            preliminaryType: "DSPW",
            axisScores: { oiliness: 44, sensitivity: 67, pigmentation: 67, elasticity: 67 },
          },
        },
      });
    });
    await page.getByRole("button", { name: "문진 완료하기" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "설문 응답을 저장하지 못했습니다" }),
    ).toContainText("설문 응답을 저장하지 못했습니다");
    await expect(page.getByRole("radio").nth(2)).toBeChecked();
    await page.screenshot({
      path: testInfo.outputPath(`survey-error-${width}.png`),
      fullPage: true,
    });
    await page.getByRole("button", { name: "재시도", exact: true }).click();
    await expect(page.getByRole("button", { name: "저장 중…" })).toBeDisabled();
    await expect(page.getByRole("radio").first()).toBeDisabled();
    await expect.poll(() => requests.length).toBe(2);
    expect(requests[1]).toEqual(requests[0]);
    expect(requests[1].answers).toHaveLength(12);
    release?.();
    await expect(page.getByRole("heading", { name: "문진 응답을 저장했어요" })).toBeVisible();
    await expect(
      page.getByText("사진 분석과 최종 리포트는 아직 연결되지 않았습니다.", { exact: false }),
    ).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath(`survey-complete-${width}.png`),
      fullPage: true,
    });
  });
}
