import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
for (const width of [320, 1280])
  test(`skin shopping demo filters and product detail at ${width}px`, async ({ page }) => {
    const catalogRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/v1/catalog")) catalogRequests.push(request.url());
    });
    await page.setViewportSize({ width, height: 960 });
    await page.goto("/catalog/products");
    await expect(page.getByRole("heading", { name: "피부로 고르는 뷰티 스토어" })).toBeVisible();
    await expect(page.getByLabel("예시 피부 타입")).toBeVisible();
    await expect(page.locator("article")).toHaveCount(8);
    await expect(page.getByRole("link", { name: "구매처 확인" })).toHaveCount(0);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: test.info().outputPath(`skin-shop-${width}.png`),
      fullPage: true,
    });
    await expect(page.locator("main")).not.toContainText("비색소성");
    await page.getByLabel("피부 특성", { exact: true }).selectOption("COMBINATION");
    await expect(page.getByLabel("예시 피부 타입")).toHaveCount(0);
    await expect(page.locator("article")).toHaveCount(8);
    const pores = page.getByRole("button", { name: "모공", exact: true });
    const pigmentation = page.getByRole("button", { name: "색소침착", exact: true });
    await pores.click();
    await expect(pores).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("article")).toHaveCount(4);
    await pigmentation.click();
    await expect(pigmentation).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("article")).toHaveCount(4);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: test.info().outputPath(`skin-shop-combination-${width}.png`),
      fullPage: true,
    });
    await pores.click();
    await pigmentation.click();
    await expect(page.locator("article")).toHaveCount(8);
    await page.getByLabel("피부 특성", { exact: true }).selectOption("OILY");
    await page.getByLabel("예시 피부 타입").selectOption("OSNW");
    await expect(page.getByLabel("성분 필터")).toContainText("병풀추출물");
    await page.getByRole("tab", { name: "토너", exact: true }).click();
    await expect(page.locator("article")).toHaveCount(2);
    await page.getByLabel("성분 필터").selectOption("히알루론산");
    await expect(page.locator("article")).toHaveCount(2);
    await page.getByLabel("상품 정렬").selectOption("name");
    const opener = page.getByRole("button", { name: "성분·추천 이유" }).first();
    await opener.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText("쇼핑 화면 체험용 가상 상품입니다. 실제 구매·결제는 할 수 없어요."),
    ).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
    await page.getByLabel("상품·브랜드·성분 검색").fill("없는상품");
    await expect(page.getByRole("heading", { name: "조건에 맞는 상품이 없어요" })).toBeVisible();
    await page.getByRole("button", { name: "필터 초기화" }).click();
    await expect(page.locator("article")).toHaveCount(8);
    await page.getByLabel("상품·브랜드·성분 검색").fill("판테놀");
    expect(await page.locator("article").count()).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.reload();
    await expect(page.getByLabel("예시 피부 타입")).toHaveValue("DSNW");
    expect(catalogRequests).toEqual([]);
  });
