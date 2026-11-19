import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import SafetyLoading from "../app/catalog/procedures/[slug]/loading";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { procedureSafetyRoutes, safetyResponseSchema } from "../lib/catalog/procedure-safety-types";
let clientIp = "";
test.beforeEach(async ({ context }) => {
  const hex = randomBytes(4).toString("hex");
  clientIp = `2001:db8:${hex.slice(0, 4)}:${hex.slice(4)}::1`;
  await context.setExtraHTTPHeaders({ "x-real-ip": clientIp });
});
function fixture(action: string, path: string) {
  execFileSync(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      "tests/fixtures/procedure-safety-data.ts",
      action,
      path,
    ],
    { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"], timeout: 15000 },
  );
}
for (const width of [320, 1280]) {
  test(`RF risk distinguishes microneedling from non-invasive devices at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/catalog/procedures/rf-tightening");
    const warning = page.locator("main").getByText(/RF 미세침 방식의 일부 사용에서는/);
    await expect(warning).toBeVisible();
    await expect(warning).toContainText("흉터·지방 손실·신경 손상");
    await expect(warning).toContainText("비침습 RF와 구분");
    await expect(page.getByRole("complementary", { name: "진단 전 안내" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      (await new AxeBuilder({ page }).include("main").withTags(["wcag2a", "wcag2aa"]).analyze())
        .violations,
    ).toEqual([]);
    await page.screenshot({ path: info.outputPath(`rf-safety-${width}.png`), fullPage: true });
    await page.getByRole("link", { name: "시술 목록으로 돌아가기" }).click();
    await page.getByRole("button", { name: "고주파 타이트닝 상세 보기" }).click();
    const modalWarning = page.getByRole("dialog").getByText(/RF 미세침 방식의 일부 사용에서는/);
    await modalWarning.scrollIntoViewIfNeeded();
    await expect(modalWarning).toBeInViewport();
    await page.screenshot({ path: info.outputPath(`rf-modal-${width}.png`) });
  });

  test(`loading component remains readable and prevents copying at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/catalog/procedures");
    // Complete a real client interaction before replacing the main region
    // for this component-only screenshot, so hydration cannot overwrite it.
    await page.getByRole("button", { name: "피코레이저 토닝 상세 보기" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    // Visual inspection of the real route loading component under the app's
    // styles; this is a component state test, not a delayed backend simulation.
    const html = renderToStaticMarkup(createElement(SafetyLoading));
    await page.locator("main").evaluate((element, markup) => {
      element.innerHTML = markup;
    }, html);
    await expect(page.locator("main").getByRole("status")).toHaveAttribute("aria-busy", "true");
    await expect(page.getByRole("button", { name: "상담 질문지 복사하기" })).toBeDisabled();
    await expect(page.getByRole("complementary", { name: "진단 전 안내" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath(`safety-loading-${width}.png`), fullPage: true });
  });

  test(`safety detail, checklist copy, route entry and reflow at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            document.documentElement.dataset.defenseText = text;
          },
        },
      });
    });
    await page.goto("/catalog/procedures");
    const entry = page
      .getByRole("link", { name: "부작용·사후 관리와 상담 질문", exact: true })
      .first();
    await entry.click();
    await expect(page).toHaveURL(/\/catalog\/procedures\/pico-toning$/);
    await expect(page.getByRole("heading", { name: "피코레이저 토닝", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "작용 원리와 적용 범위" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "부작용 위험과 사후 관리" })).toBeVisible();
    await expect(
      page.getByRole("region", { name: "상담 전 과잉 진료 방어 질문지" }).locator("ol > li"),
    ).toHaveCount(3);
    await expect(page.getByRole("complementary", { name: "진단 전 안내" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    for (const control of await page.locator("main").getByRole("link").all()) {
      const size = await control.boundingBox();
      expect(size?.height).toBeGreaterThanOrEqual(44);
    }
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({ path: info.outputPath(`safety-ready-${width}.png`), fullPage: true });
    await page.getByRole("button", { name: "상담 질문지 복사하기" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "상담 체크리스트가 복사되었습니다." }),
    ).toBeVisible();
    const text = await page.evaluate(() => document.documentElement.dataset.defenseText ?? "");
    expect(text).toContain("[피부과 상담 과잉 진료 방어 질문지 - 피코레이저 토닝]");
    expect(text).toContain("\n1. ");
    expect(text).toContain("\n2. ");
    expect(text).toContain("\n3. ");
    expect(text).toContain("* 본 질문지는 객관적 정보 확인을 위한 가이드입니다.");
    await page.getByRole("link", { name: "시술 목록으로 돌아가기" }).click();
    await expect(page).toHaveURL(/\/catalog\/procedures$/);
  });
  test(`quota failure remains recoverable and keeps the disclaimer at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    // All requests target this owned local test server and this test's synthetic IP.
    for (let i = 0; i < 120; i++) {
      const response = await page.request.get("/api/v1/catalog/procedures/pico-toning", {
        headers: { "x-real-ip": clientIp },
      });
      expect(response.status()).toBe(200);
    }
    const denied = await page.request.get("/api/v1/catalog/procedures/pico-toning", {
      headers: { "x-real-ip": clientIp },
    });
    expect(denied.status()).toBe(429);
    expect(Number(denied.headers()["retry-after"])).toBeGreaterThan(0);
    await page.goto("/catalog/procedures/pico-toning");
    await expect(page.locator("main").getByRole("alert")).toContainText(
      "시술 정보 요청이 많습니다",
    );
    await expect(page.getByRole("button", { name: "다시 시도" })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "진단 전 안내" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath(`safety-failure-${width}.png`), fullPage: true });
  });
  test(`missing safety content is an honest empty state at ${width}px`, async ({ page }, info) => {
    test.skip(
      info.project.name !== "stored-photo",
      "Published data is immutable and complete; only the database source can have missing metadata.",
    );
    const path = `/tmp/sikin-procedure-safety-${randomUUID()}.json`;
    fixture("empty", path);
    try {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/catalog/procedures/pico-toning");
      await expect(page.locator("main").getByRole("status")).toContainText(
        "현재 해당 시술의 상세 가이드를 준비 중입니다.",
      );
      await expect(page.getByRole("button", { name: "상담 질문지 복사하기" })).toHaveCount(0);
      await expect(page.getByRole("link", { name: "다른 시술 가이드 보기" })).toBeVisible();
      await expect(page.getByRole("complementary", { name: "진단 전 안내" })).toBeVisible();
      await page.screenshot({ path: info.outputPath(`safety-empty-${width}.png`), fullPage: true });
    } finally {
      fixture("restore", path);
    }
  });
}
for (const mode of ["denied", "unsupported"]) {
  test(`a ${mode} clipboard exposes the complete selectable defense checklist`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.addInitScript(
      (m) =>
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value:
            m === "unsupported"
              ? undefined
              : {
                  writeText: async () => {
                    throw Error("Denied");
                  },
                },
        }),
      mode,
    );
    await page.goto("/catalog/procedures/ha-skinbooster");
    await page.getByRole("button", { name: "상담 질문지 복사하기" }).click();
    const field = page.getByRole("textbox", { name: "직접 복사할 상담 질문" });
    await expect(field).toBeFocused();
    await expect(field).toContainText(
      "[피부과 상담 과잉 진료 방어 질문지 - 히알루론산 스킨부스터]",
    );
    await page.screenshot({ path: info.outputPath(`safety-copy-${mode}-320.png`) });
  });
}
test("all ten slug projections are public, unknown slugs recover and writes are rejected", async ({
  page,
}) => {
  for (const route of procedureSafetyRoutes) {
    const response = await page.request.get(`/api/v1/catalog/procedures/${route.slug}`, {
      headers: { "x-real-ip": clientIp },
    });
    expect(response.status()).toBe(200);
    expect(safetyResponseSchema.parse(await response.json()).data.readiness).toBe("READY");
  }
  await page.request.get("/catalog/procedures/pico-toning", { headers: { "x-real-ip": clientIp } });
  const started = performance.now();
  const rendered = await page.request.get("/catalog/procedures/pico-toning", {
    headers: { "x-real-ip": clientIp },
  });
  expect(await rendered.text()).toContain("상담 전 과잉 진료 방어 질문지");
  expect(performance.now() - started).toBeLessThan(1000);
  const unknown = await page.request.get("/api/v1/catalog/procedures/does-not-exist", {
    headers: { "x-real-ip": clientIp },
  });
  expect(unknown.status()).toBe(404);
  expect((await unknown.json()).error.code).toBe("PROCEDURE_NOT_FOUND");
  expect(
    (
      await page.request.post("/api/v1/catalog/procedures/pico-toning", {
        headers: { "x-real-ip": clientIp },
      })
    ).status(),
  ).toBe(405);
  await page.goto("/catalog/procedures/does-not-exist");
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "시술 정보를 불러올 수 없습니다.",
  );
  await expect(page.getByRole("link", { name: "시술 목록으로 돌아가기" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "진단 전 안내" })).toBeVisible();
});
