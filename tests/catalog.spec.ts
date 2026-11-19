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
    if (width === 320) {
      await page.goto("/catalog/products");
      await expect(page.getByText("내 리포트 기반", { exact: true })).toBeVisible();
      await expect(page.getByLabel("예시 피부 타입")).toHaveCount(0);
    }
    await page.goto(`/catalog/products?reportId=${state.reportId}`);
    const tabs = page.getByRole("tab");
    await expect(tabs).toHaveCount(5);
    for (let i = 1; i < 5; i++) {
      await tabs.nth(i).click();
      await expect(tabs.nth(i)).toHaveAttribute("aria-selected", "true");
      await expect(page.locator("article")).toHaveCount(2);
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
    await tabs.nth(1).click();
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
  await expect(page.getByRole("tab")).toHaveCount(5);
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

for (const width of [320, 1280]) {
  test(`full ingredient warnings, search, sticky notice and keyboard at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/catalog/products?reportId=${state.reportId}`);
    const opener = page.getByRole("button", { name: "전성분 & 맞춤 성분 분석" }).first();
    await expect(opener).toBeVisible();
    // The official list can change after a recommendation was rendered. Fetch
    // fresh product data for the sheet rather than trusting the card's cached tags.
    fixture("ingredient-caution");
    await opener.click();
    const dialog = page.getByRole("dialog");
    const sheet = dialog.getByRole("region", { name: "제품 전성분 분석" });
    await expect(sheet.getByText("민감성 피부 주의 · 변성알코올", { exact: true })).toBeVisible();
    await expect(sheet.getByText("진단 추천과 일치", { exact: true })).toBeVisible();
    const list = sheet.getByRole("list", { name: "등록된 전성분 순서" });
    await expect(list.locator("li")).toHaveText([
      "정제수",
      "Panthenol",
      "Alcohol Denat.",
      "1,2-Hexanediol",
    ]);
    const search = sheet.getByRole("searchbox", { name: "전성분 검색" });
    await search.fill("alcohol");
    await expect(list.locator("mark")).toHaveText("Alcohol Denat.");
    await expect(list.locator("li")).toHaveCount(4);
    await expect(sheet.getByRole("status")).toContainText("1개 일치");
    const footer = dialog.locator("footer");
    await expect(footer).toContainText("원료적 특성에 한하며");
    const d = await dialog.boundingBox(),
      f = await footer.boundingBox();
    expect(f!.y + f!.height).toBeLessThanOrEqual(d!.y + d!.height);
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect((await search.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: info.outputPath(`ingredients-warning-${width}.png`) });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
  });
}

for (const width of [320, 1280])
  test(`ingredient loading and failure keep the notice visible and retry into an honest empty state at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/catalog/products?reportId=${state.reportId}`);
    let release: () => void = () => {};
    let call = 0;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/v1/catalog/products/*/ingredients?**", async (route) => {
      call++;
      if (call === 1) {
        await gate;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ success: false, error: { code: "UNAVAILABLE" } }),
        });
      } else {
        const upstream = await route.fetch();
        const body = await upstream.json();
        body.data.fullIngredients = [];
        body.data.beneficialIngredients = [];
        body.data.cautionIngredients = [];
        body.data.ingredientsSummary = { totalCount: 0, beneficialCount: 0, cautionCount: 0 };
        await route.fulfill({ response: upstream, json: body });
      }
    });
    await page.getByRole("button", { name: "전성분 & 맞춤 성분 분석" }).first().click();
    const dialog = page.getByRole("dialog");
    const status = dialog.getByRole("status", { name: "성분 정보 확인 중" });
    await expect(status).toHaveAttribute("aria-busy", "true");
    await expect(dialog.locator("footer")).toBeVisible();
    await page.screenshot({ path: info.outputPath(`ingredients-loading-${width}.png`) });
    release();
    await expect(dialog.getByRole("alert")).toContainText("성분 정보를 불러오지 못했습니다");
    await page.screenshot({ path: info.outputPath(`ingredients-error-${width}.png`) });
    await dialog.getByRole("button", { name: "성분 정보 다시 시도" }).click();
    await expect(dialog).toContainText("전성분 상세 검증 준비 중인 상품입니다");
    await expect(dialog.getByRole("list", { name: "등록된 전성분 순서" })).toHaveCount(0);
    await page.screenshot({ path: info.outputPath(`ingredients-empty-${width}.png`) });
  });

test("public ingredient endpoint rejects invalid inputs and never treats a product ID as report authorization", async ({
  request,
}) => {
  const endpoint = `/api/v1/catalog/products/${state.primaryId}/ingredients`;
  expect((await request.get(`${endpoint}?baumannType=BAD`)).status()).toBe(400);
  expect((await request.get(`${endpoint}?baumannType=OSNW&baumannType=ORNT`)).status()).toBe(400);
  expect(
    (
      await request.get(`${endpoint}?reportId=${state.reportId}`, { headers: { cookie: "" } })
    ).status(),
  ).toBe(404);
  expect((await request.get(`/api/v1/catalog/products/${randomUUID()}/ingredients`)).status()).toBe(
    404,
  );
  const body = await (await request.get(`${endpoint}?baumannType=OSNW`)).json();
  expect(body.success).toBe(true);
  expect(body.data.targetBaumannType).toBe("OSNW");
});

test("the owned report opens its own ingredient view without substituting a newer report", async ({
  page,
}) => {
  await page.goto(`/diagnostic/result/${state.reportId}`);
  const region = page.getByRole("region", { name: "이 리포트의 화장품 성분 확인" });
  await expect(page.getByRole("link", { name: "맞춤 화장품 추천 보러가기" })).toHaveAttribute(
    "href",
    `/catalog/products?reportId=${state.reportId}`,
  );
  await region.getByRole("button", { name: "전성분 & 맞춤 성분 분석" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("본인 진단 기준");
  await expect(dialog.getByText("진단 추천과 일치", { exact: true })).toBeVisible();
});
