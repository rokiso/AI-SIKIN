import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const statePath = `/tmp/sikin-catalog-fixture-${randomUUID()}.json`;
function fixture(action: string): string {
  return execFileSync(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      "tests/fixtures/catalog-data.ts",
      action,
      statePath,
    ],
    { encoding: "utf8" },
  );
}
let state: { token: string; reportId: string; primaryId: string; secondaryId: string };
test.beforeAll(() => {
  state = JSON.parse(fixture("initialize"));
});
test.afterAll(() => {
  fixture("cleanup");
});
test.beforeEach(async ({ context }) => {
  fixture("restore");
  await context.addCookies([
    {
      name: "app_session_token",
      value: state.token,
      url: "http://127.0.0.1:3000",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
});
for (const width of [320, 1280])
  test(`four categories, alternate cards and safe purchase at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`/catalog/products?reportId=${state.reportId}`);
    const tabs = page.getByRole("tab");
    await expect(tabs).toHaveCount(4);
    for (let i = 0; i < 4; i++) {
      await tabs.nth(i).click();
      await expect(tabs.nth(i)).toHaveAttribute("aria-selected", "true");
      await page.getByText("대체 상품 보기", { exact: true }).click();
      await expect(page.getByRole("link", { name: "구매처 확인" })).toHaveCount(2);
      for (const link of await page.getByRole("link", { name: "구매처 확인" }).all()) {
        const box = await link.boundingBox();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
    }
    await tabs.nth(0).click();
    await tabs.nth(0).press("ArrowRight");
    await expect(tabs.nth(1)).toBeFocused();
    await tabs.nth(1).press("Home");
    await expect(
      page.getByText(
        "본 추천은 화장품 성분 특성에 기반하며 질병의 예방 및 치료를 위한 의학적 효능·효과를 의미하지 않습니다.",
      ),
    ).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: test.info().outputPath(`catalog-${width}.png`), fullPage: true });
    await page.route("https://shop.example.com/**", (route) =>
      route.fulfill({ contentType: "text/html; charset=utf-8", body: "<h1>모의 판매처</h1>" }),
    );
    fixture("stockout");
    const response = page.waitForResponse((r) => r.url().includes("/api/v1/catalog/redirect?"));
    await page.getByRole("link", { name: "구매처 확인" }).first().click();
    expect((await response).status()).toBe(302);
    await expect(page.getByRole("heading", { name: "모의 판매처" })).toBeVisible();
    const logs: { productId: string; tier: string }[] = JSON.parse(fixture("clicks"));
    expect(logs[0]).toMatchObject({ productId: state.secondaryId, tier: "SECONDARY" });
  });
test("network failure retries, empty catalog retains guide and bad redirect recovers", async ({
  page,
}) => {
  await page.route("**/api/v1/catalog/products/recommendations?**", (route) => route.abort());
  await page.goto(`/catalog/products?reportId=${state.reportId}`);
  await expect(page.getByRole("alert", { name: "추천 상품 오류" })).toBeVisible();
  await page.unroute("**/api/v1/catalog/products/recommendations?**");
  await page.getByRole("button", { name: "다시 시도" }).click();
  await expect(page.getByRole("tab")).toHaveCount(4);
  await page.route("**/api/v1/catalog/products/recommendations?**", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    for (const c of body.data.categories) {
      c.primaryProduct = null;
      c.secondaryProduct = null;
      c.isFallbackActive = false;
    }
    await route.fulfill({ response, json: body });
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: "맞춤 제품을 선별 중이에요" })).toBeVisible();
  await expect(page.getByText(/성분 가이드: 판테놀/)).toBeVisible();
  await page.goto("/api/v1/catalog/redirect?url=https://evil.example");
  await expect(page).toHaveURL(/\/catalog\/redirect\/error$/);
  await expect(page.getByRole("link", { name: "리포트로 돌아가기" })).toBeVisible();
});
