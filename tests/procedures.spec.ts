import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import {
  formatPriceMean,
  formatProcedurePrice,
  procedureListResponseSchema,
} from "../lib/catalog/procedures";

for (const width of [320, 1280]) {
  test(`procedure guide and dialog reflow, keyboard focus, and clipboard at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            document.documentElement.dataset.copiedChecklist = text;
          },
        },
      });
    });
    await page.goto("/catalog/procedures");
    await expect(page.getByRole("button", { name: /상세 보기$/ })).toHaveCount(10);
    const catalogResponse = await page.request.get("/api/v1/catalog/procedures");
    expect(catalogResponse.status()).toBe(200);
    const catalog = procedureListResponseSchema.parse(await catalogResponse.json()).data.procedures;
    await expect(page.getByText("가격 자료 확인 중", { exact: true })).toHaveCount(
      catalog.filter((item) => item.priceSummary.status === "UNVERIFIED").length,
    );
    for (const procedure of catalog) {
      const card = page
        .locator("main li")
        .filter({ has: page.getByRole("button", { name: `${procedure.nameKo} 상세 보기` }) });
      await expect(card.getByText(formatProcedurePrice(procedure), { exact: true })).toBeVisible();
      if (
        procedure.priceSummary.status === "AVAILABLE" &&
        procedure.priceSummary.sampleCount === 1
      ) {
        await expect(card.getByText("공개 가격 자료 1건", { exact: true })).toBeVisible();
        await expect(card.getByText(/수집 표본 평균/)).toHaveCount(0);
        await expect(
          card.getByText("가격 범위를 판단하기에는 자료가 부족합니다.", { exact: true }),
        ).toBeVisible();
      }
    }
    const ldm = catalog.find((item) => item.code === "P-LDM");
    if (ldm?.priceSummary.sampleCount === 1) {
      await page.getByRole("button", { name: `${ldm.nameKo} 상세 보기` }).click();
      const detail = page.getByRole("dialog");
      await expect(detail.getByText("공개 가격 자료 1건", { exact: true })).toBeVisible();
      await expect(detail.getByText(/수집 표본 평균/)).toHaveCount(0);
      await detail.getByText("공개 가격 자료 1건", { exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath(`ldm-single-price-${width}.png`) });
      await detail.getByRole("button", { name: "시술 상세 닫기" }).click();
    }
    await expect(page.getByRole("complementary", { name: "진단 전 안내" })).toBeVisible();
    await page.getByRole("button", { name: "색소·잡티", exact: true }).click();
    await expect(page).toHaveURL(/concern=PIGMENTATION$/);
    await expect(page.getByRole("button", { name: /상세 보기$/ })).toHaveCount(1);
    await page.reload();
    await expect(page.getByRole("button", { name: "색소·잡티", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const open = page.getByRole("button", { name: "피코레이저 토닝 상세 보기" });
    await page.locator("main li").filter({ has: open }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`procedures-${width}.png`) });
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await open.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "피코레이저 토닝" })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "부작용·주의사항" })).toBeVisible();
    await expect(dialog.getByRole("complementary", { name: "진단 전 안내" })).toBeVisible();
    const questions = await dialog.locator("ol li").allTextContents();
    expect(questions).toHaveLength(3);
    await dialog.getByRole("button", { name: "상담 체크리스트 복사" }).click();
    await expect(dialog.getByRole("status")).toHaveText("상담 체크리스트 3문항이 복사되었습니다.");
    await expect(dialog.getByRole("status")).toBeInViewport({ ratio: 1 });
    const statusInset = await dialog.evaluate((node) => {
      const status = node.querySelector('[role="status"]');
      if (!status) throw new Error("Copy status missing");
      return node.getBoundingClientRect().bottom - status.getBoundingClientRect().bottom;
    });
    expect(statusInset).toBeGreaterThanOrEqual(12);
    await expect(page.locator("html")).toHaveAttribute(
      "data-copied-checklist",
      questions.join("\n"),
    );
    const dimensions = await dialog.evaluate((node) => ({
      dialogWidth: node.getBoundingClientRect().width,
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
      pageWidth: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }));
    expect(dimensions.dialogWidth).toBeLessThanOrEqual(width);
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
    expect(dimensions.pageWidth).toBeLessThanOrEqual(dimensions.viewport);
    const sizes = await dialog.locator("button").evaluateAll((buttons) =>
      buttons.map((button) => ({
        width: button.getBoundingClientRect().width,
        height: button.getBoundingClientRect().height,
      })),
    );
    for (const size of sizes) {
      expect(size.width).toBeGreaterThanOrEqual(44);
      expect(size.height).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({ path: info.outputPath(`procedures-dialog-${width}.png`) });
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(open).toBeFocused();
  });
}
for (const mode of ["denied", "unsupported"]) {
  test(`clipboard ${mode} offers selectable text inside the detail dialog`, async ({ page }) => {
    await page.addInitScript((mode) => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value:
          mode === "unsupported"
            ? undefined
            : {
                writeText: async () => {
                  throw new DOMException("Denied", "NotAllowedError");
                },
              },
      });
    }, mode);
    await page.goto("/catalog/procedures?concern=PIGMENTATION");
    await page.getByRole("button", { name: "피코레이저 토닝 상세 보기" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "상담 체크리스트 복사" }).click();
    const field = dialog.getByRole("textbox", { name: "직접 복사할 상담 질문" });
    await expect(field).toBeFocused();
    const selected = await field.evaluate((node: HTMLTextAreaElement) => ({
      selected: node.value.slice(node.selectionStart, node.selectionEnd),
      text: node.value,
    }));
    expect(selected.selected).toBe(selected.text);
    expect(selected.text.split("\n")).toHaveLength(3);
    await expect(dialog.getByRole("status")).toContainText("자동 복사를 사용할 수 없습니다.");
    await expect(dialog.getByRole("button", { name: "복사 완료" })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });
}
test("detail loading and failure remain visible and retry recovers", async ({ page }) => {
  await page.goto("/catalog/procedures?concern=PIGMENTATION");
  let fail = true;
  const gate = Promise.withResolvers<void>();
  await page.route("**/api/v1/catalog/procedures/*", async (route) => {
    if (fail) {
      await gate.promise;
      await route.fulfill({
        status: 503,
        json: { success: false, error: { code: "PROCEDURES_UNAVAILABLE" } },
      });
    } else await route.continue();
  });
  await page.getByRole("button", { name: "피코레이저 토닝 상세 보기" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("status")).toHaveText("시술 정보를 불러오는 중입니다.");
  gate.resolve();
  await expect(dialog.getByRole("alert")).toContainText("시술 상세 정보를 불러오지 못했습니다.");
  fail = false;
  await dialog.getByRole("button", { name: "다시 시도" }).click();
  await expect(dialog.getByRole("heading", { name: "피코레이저 토닝" })).toBeVisible();
});
test("collected PN unit prices show all three sources and disclose unconfirmed session counts", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 900 });
  const response = await page.request.get("/api/v1/catalog/procedures?concern=ELASTICITY");
  const procedure = procedureListResponseSchema
    .parse(await response.json())
    .data.procedures.find((item) => item.code === "P-PN");
  if (!procedure || procedure.priceSummary.meanKrw === null)
    throw new Error("Import the committed PN price dataset before this integration check");
  expect(procedure.priceSummary.platforms).toEqual(["강남언니", "바비톡", "여신티켓"]);
  await page.goto("/catalog/procedures?concern=ELASTICITY");
  await page.getByRole("button", { name: `${procedure.nameKo} 상세 보기` }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText(
      `수집 표본 평균 ${formatPriceMean(procedure.priceSummary.meanKrw)} · ${procedure.priceSummary.sampleCount}건`,
    ),
  ).toBeVisible();
  await expect(dialog.getByText(/강남언니·바비톡·여신티켓 공개 자료/)).toBeVisible();
  await expect(dialog.getByText(/횟수·주입 방식·추가비용 별도 확인/)).toBeVisible();
  await page.screenshot({ path: info.outputPath("pn-three-platforms-320.png") });
  expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
});

test("public endpoints filter and reject writes and unknown inputs", async ({ request }) => {
  const response = await request.get("/api/v1/catalog/procedures");
  expect(response.status()).toBe(200);
  expect((await response.json()).data.total).toBe(10);
  const filtered = await request.get("/api/v1/catalog/procedures?concern=PIGMENTATION");
  expect(
    (await filtered.json()).data.procedures.every(
      (p: { concernType: string }) => p.concernType === "PIGMENTATION",
    ),
  ).toBe(true);
  expect((await request.get("/api/v1/catalog/procedures?concern=INVALID")).status()).toBe(400);
  expect((await request.get("/api/v1/catalog/procedures/not-an-id")).status()).toBe(404);
  expect((await request.post("/api/v1/catalog/procedures", { data: {} })).status()).toBe(405);
});
