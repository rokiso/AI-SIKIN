import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const routes = [
  "/",
  "/diagnostic",
  "/catalog/products",
  "/catalog/procedures",
  "/snapshot",
  "/mypage",
] as const;

const tabs = ["/", "/diagnostic", "/catalog/products", "/catalog/procedures", "/mypage"] as const;
const disclaimer = "본 서비스의 분석 및 추천 결과는 의료 진단이나 치료를 대체할 수 없으며, 일상 스킨케어 관리를 위한 가이드입니다.";
const guestCookie = "x-guest-session-id";
const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function expectAccessibleControls(page: Page) {
  const undersized = await page.locator("a, button").evaluateAll((controls) =>
    controls.flatMap((control) => {
      const bounds = control.getBoundingClientRect();
      const style = window.getComputedStyle(control);
      if (style.display === "none" || style.visibility === "hidden" || !control.getClientRects().length) {
        return [];
      }
      return bounds.width < 44 || bounds.height < 44
        ? [{ text: control.textContent?.trim(), width: bounds.width, height: bounds.height }]
        : [];
    }),
  );
  expect(undersized, "Every standalone link and button needs a 44×44 CSS pixel hit area").toEqual([]);
}

for (const width of [320, 375, 430, 1280]) {
  test(`all six routes reflow without clipping at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });

    for (const route of routes) {
      const response = await page.goto(route);
      expect(response?.status(), `${route} responds successfully`).toBe(200);
      await expect(page.locator("main h1")).toBeVisible();
      await expect(page.getByText(disclaimer, { exact: true })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("link")).toHaveCount(5);

      const dimensions = await page.getByTestId("app-shell").evaluate((shell) => {
        const bounds = shell.getBoundingClientRect();
        return {
          width: bounds.width,
          left: bounds.left,
          viewport: window.innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          wordBreak: window.getComputedStyle(document.querySelector("main") ?? shell).wordBreak,
        };
      });
      expect(dimensions.width).toBeLessThanOrEqual(430);
      expect(dimensions.width).toBe(Math.min(width, 430));
      expect(dimensions.left).toBeCloseTo((width - dimensions.width) / 2, 0);
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.viewport);
      expect(dimensions.wordBreak).toBe("keep-all");
      await expectAccessibleControls(page);

      const viewport = await page.locator('meta[name="viewport"]').getAttribute("content");
      expect(viewport).not.toContain("user-scalable=no");
      expect(viewport).not.toContain("maximum-scale=1");

      if (width === 320 || width === 1280) {
        const accessibility = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
          .analyze();
        expect.soft(accessibility.violations, `${route} accessibility violations at ${width}px`).toEqual([]);
      }

      await page.screenshot({
        path: testInfo.outputPath(`${route === "/" ? "home" : route.slice(1).replaceAll("/", "-")}-${width}.png`),
        fullPage: true,
      });
    }
  });
}

test("tab navigation selects the current page and header back returns to the previous page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "이전 페이지로 이동" })).toHaveCount(0);
  const navigation = page.getByRole("navigation", { name: "주요 메뉴" });

  for (const path of tabs) {
    const tab = navigation.locator(`a[href="${path}"]`);
    await tab.click();
    await expect(page).toHaveURL(new RegExp(`${path === "/" ? "/" : path}$`));
    await expect(tab).toHaveAttribute("aria-current", "page");
    await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
  }

  await page.getByRole("button", { name: "이전 페이지로 이동" }).click();
  await expect(page).toHaveURL(/\/catalog\/procedures$/);
});

test("snapshot and mypage provide honest empty states and a diagnosis recovery action", async ({ page }) => {
  for (const route of ["/snapshot", "/mypage"]) {
    await page.goto(route);
    await expect(page.getByText("아직 기록된 피부 분석 리포트가 없습니다.", { exact: true })).toBeVisible();
    await expect(page.getByText("지금 3분 피부 진단을 받고 맞춤 케어 가이드를 확인해보세요.", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "피부 진단 시작하기", exact: true }).click();
    await expect(page).toHaveURL(/\/diagnostic$/);
  }
});

test("direct-entry back safely returns home, and revisiting a route preserves real navigation history", async ({ page }) => {
  await page.goto("/diagnostic");
  await page.getByRole("button", { name: "이전 페이지로 이동" }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/diagnostic");
  const navigation = page.getByRole("navigation", { name: "주요 메뉴" });
  await navigation.locator('a[href="/catalog/products"]').click();
  await expect(page).toHaveURL(/\/catalog\/products$/);
  await navigation.locator('a[href="/diagnostic"]').click();
  await expect(page).toHaveURL(/\/diagnostic$/);
  await page.getByRole("button", { name: "이전 페이지로 이동" }).click();
  await expect(page).toHaveURL(/\/catalog\/products$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/diagnostic$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/catalog\/products$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/diagnostic$/);
  await page.getByRole("button", { name: "이전 페이지로 이동" }).click();
  await expect(page).toHaveURL(/\/catalog\/products$/);
  await page.getByRole("button", { name: "이전 페이지로 이동" }).click();
  await expect(page).toHaveURL(/\/diagnostic$/);
  await page.getByRole("button", { name: "이전 페이지로 이동" }).click();
  await expect(page).toHaveURL(/\/$/);
});

for (const width of [320, 1280]) {
  test(`keyboard focus stays visible above fixed navigation at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const skipLink = page.getByRole("link", { name: "본문으로 바로가기", exact: true });
    await page.keyboard.press("Tab");
    await expect(skipLink).toBeFocused();
    const focusedStyle = await skipLink.evaluate((link) => {
      const style = window.getComputedStyle(link);
      return { outlineStyle: style.outlineStyle, outlineWidth: Number.parseFloat(style.outlineWidth), top: link.getBoundingClientRect().top };
    });
    expect(focusedStyle.outlineStyle).not.toBe("none");
    expect(focusedStyle.outlineWidth).toBeGreaterThanOrEqual(2);
    expect(focusedStyle.top).toBeGreaterThanOrEqual(0);
    await page.screenshot({ path: testInfo.outputPath(`keyboard-skip-focus-${width}.png`) });
    await page.keyboard.press("Enter");
    await expect(page.locator("main")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "무료 AI 피부 진단 시작하기", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    const nextLink = page.getByRole("navigation", { name: "맞춤 관리 바로가기" }).getByRole("link", { name: /맞춤 화장품 둘러보기/ });
    await expect(nextLink).toBeFocused();
    await expect.poll(() => nextLink.evaluate((link) => {
      const bounds = link.getBoundingClientRect();
      const navigation = document.querySelector('nav[aria-label="주요 메뉴"]');
      const header = document.querySelector("header");
      if (!navigation || !header) throw new Error("App navigation landmarks are missing");
      return {
        clearOfHeader: bounds.top - 6 >= header.getBoundingClientRect().bottom,
        clearOfNavigation: bounds.bottom + 6 <= navigation.getBoundingClientRect().top,
      };
    })).toEqual({ clearOfHeader: true, clearOfNavigation: true });
    await page.screenshot({ path: testInfo.outputPath(`keyboard-quicknav-focus-${width}.png`) });
  });
}

test("unknown routes recover to home and nested diagnostic routes keep the disclaimer in full-screen mode", async ({ page }) => {
  await page.goto("/non-existent-route");
  await expect(page.locator("main h1")).toBeVisible();
  await page.getByRole("link", { name: "홈으로 이동", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/diagnostic/missing");
  await expect(page.getByText(disclaimer, { exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "주요 메뉴" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "이전 페이지로 이동" })).toBeVisible();
});

test("offline feedback is announced and clears when the connection returns", async ({ page, context }) => {
  await page.goto("/");
  await context.setOffline(true);
  const offlineStatus = page.getByRole("status").filter({ hasText: "인터넷 연결이 끊겼습니다." });
  await expect(offlineStatus).toBeVisible();
  await context.setOffline(false);
  await expect(offlineStatus).toHaveCount(0);
});

test("health is public, returns UTC ISO time and issues a safe persistent guest identifier", async ({ context }) => {
  const response = await context.request.get("/api/v1/health");
  expect(response.status()).toBe(200);
  const body: unknown = await response.json();
  expect(body).toEqual({
    success: true,
    data: { status: "pass", database: "connected", timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/), version: "v1" },
  });
  const cookies = await context.cookies();
  const guest = cookies.find((cookie) => cookie.name === guestCookie);
  expect(guest).toMatchObject({ httpOnly: true, secure: true, sameSite: "Lax", path: "/" });
  expect(guest?.value).toMatch(uuidV4);

  await context.request.get("/mypage");
  expect((await context.cookies()).find((cookie) => cookie.name === guestCookie)?.value).toBe(guest?.value);
});

test("malformed guest cookies are replaced and client-supplied identity headers are ignored", async ({ context, baseURL }) => {
  expect(baseURL).toBeDefined();
  await context.addCookies([{ name: guestCookie, value: "not-a-valid-guest", url: baseURL ?? "http://127.0.0.1:3000" }]);
  await context.request.get("/api/v1/health");
  const replacement = (await context.cookies()).find((cookie) => cookie.name === guestCookie);
  expect(replacement?.value).toMatch(uuidV4);
  expect(replacement?.value).not.toBe("not-a-valid-guest");

  await context.clearCookies();
  const spoofedIdentifier = "4b579c57-a36b-449f-aecc-7459783b82da";
  await context.request.get("/", { headers: { [guestCookie]: spoofedIdentifier } });
  const issued = (await context.cookies()).find((cookie) => cookie.name === guestCookie);
  expect(issued?.value).toMatch(uuidV4);
  expect(issued?.value).not.toBe(spoofedIdentifier);
});
