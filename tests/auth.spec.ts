import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
test.use({ trace: "off" });
for (const width of [320, 360, 1280]) {
  test(`social login modal handles focus, pending and retry at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/mypage");
    const opener = page.getByRole("button", { name: "로그인하고 결과 보관하기" });
    await opener.click();
    const dialog = page.getByRole("dialog", { name: "내 피부 관리 이어가기" });
    await expect(dialog).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const a11y = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(a11y.violations).toEqual([]);
    for (let i = 0; i < 7; i++) {
      await page.keyboard.press("Tab");
      expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    }
    await page.screenshot({
      path: testInfo.outputPath(`login-modal-${width}.png`),
      fullPage: true,
    });
    let finish: (() => void) | undefined;
    const waiting = new Promise<void>((resolve) => {
      finish = resolve;
    });
    await page.route("**/api/v1/auth/authorize/google?**", async (route) => {
      await waiting;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ success: false, error: { code: "AUTH_UNAVAILABLE" } }),
      });
    });
    const google = dialog.getByRole("button", { name: "Google로 로그인" });
    await google.click();
    await expect(google).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "카카오로 로그인" })).toBeDisabled();
    await expect(dialog.getByRole("status")).toContainText("이동 중");
    finish?.();
    await expect(dialog.getByRole("alert")).toContainText("다시 시도");
    await expect(google).toBeEnabled();
    await page.screenshot({
      path: testInfo.outputPath(`login-failure-${width}.png`),
      fullPage: true,
    });
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(opener).toBeFocused();
  });
}
test("callback errors scrub authorization query data and offer login recovery", async ({
  page,
}) => {
  await page.route("**/api/v1/auth/callback/google", (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ success: false, error: { code: "INVALID_OAUTH_STATE" } }),
    }),
  );
  await page.goto("/auth/callback/google?code=test-only-code&state=test-only-state");
  await expect(page.getByRole("heading", { name: "로그인하지 못했어요" })).toBeVisible();
  await expect(page).toHaveURL(/\/auth\/callback\/google$/);
  await page.getByRole("link", { name: "다시 로그인하기" }).click();
  await expect(page).toHaveURL(/\/auth\/login$/);
  await expect(page.getByRole("button", { name: "Google로 로그인" })).toBeVisible();
});
