import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const guidePath = "/catalog/products/guide";
for (const width of [320, 1280]) {
  test(`beginner guide teaches product roles and switches morning/evening at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const response = await page.goto(guidePath);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle("스킨케어 처음 시작하기 | MIRUVIA");
    await expect(
      page.getByRole("heading", { name: "처음이라면, 기본부터", exact: true }),
    ).toBeVisible();
    const productSection = page.getByRole("region", { name: "무엇을 바르는 걸까요?" });
    await expect(productSection.locator("summary")).toHaveCount(5);
    await productSection.locator("summary").filter({ hasText: "토너" }).click();
    await expect(productSection.getByText(/토너는 생략해도 괜찮아요/)).toBeVisible();
    await productSection.locator("summary").filter({ hasText: "앰플·세럼·에센스" }).click();
    await expect(productSection.getByText(/작은 병이나 걸쭉함이/)).toBeVisible();
    await productSection.locator("summary").filter({ hasText: "로션·젤크림·크림" }).click();
    await expect(productSection.getByText(/수분이 쉽게 빠져나가지 않도록/)).toBeVisible();
    await productSection.locator("summary").filter({ hasText: "자외선 차단제" }).click();
    await expect(productSection.getByText(/여름에만 사용하는 제품은 아니에요/)).toBeVisible();
    const routine = page.getByRole("region", { name: "언제, 어떤 순서로 바를까요?" });
    await expect(routine.getByRole("status").getByRole("listitem")).toHaveCount(3);
    await routine.getByRole("button", { name: "저녁", exact: true }).click();
    await expect(routine.getByRole("button", { name: "저녁", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(routine.getByRole("status").getByRole("listitem")).toHaveCount(2);
    await expect(routine.getByRole("status")).toContainText(
      "이중 세안이 모두에게 필요한 것은 아니에요",
    );
    await routine.getByRole("checkbox").check();
    await expect(routine.getByRole("status").getByRole("listitem")).toHaveCount(4);
    await routine.getByRole("button", { name: "아침", exact: true }).click();
    await expect(routine.getByRole("status").getByRole("listitem")).toHaveCount(5);
    await expect(routine.getByRole("status")).toContainText("토너 · 선택");
    await expect(routine.getByRole("status")).toContainText("앰플·세럼 · 선택");
    await expect(routine.getByRole("status")).toContainText("자외선 차단");
    await expect(page.getByRole("complementary", { name: "진단 전 안내" })).toBeVisible();
    await expect(
      page
        .getByRole("navigation", { name: "주요 메뉴" })
        .getByRole("link", { name: "화장품", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const undersized = await page
      .locator("main a, main button, main summary, main label")
      .evaluateAll((elements) =>
        elements.flatMap((el) => {
          const rect = el.getBoundingClientRect();
          if (!el.getClientRects().length) return [];
          return rect.width < 44 || rect.height < 44
            ? [{ text: el.textContent?.trim(), width: rect.width, height: rect.height }]
            : [];
        }),
      );
    expect(undersized).toEqual([]);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      window.scrollTo(0, 0);
    });
    await page.screenshot({ path: info.outputPath(`guide-start-${width}.png`) });
    await routine.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`guide-routine-${width}.png`) });
  });

  test(`moisture explanations cover all situations and reset without writes at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const writes: string[] = [];
    page.on("request", (request) => {
      if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) writes.push(request.url());
    });
    await page.goto(guidePath);
    const moisture = page.getByRole("region", { name: "계절마다 꼭 바꿔야 하나요?" });
    await expect(moisture).toContainText("달력이 바뀌었다고 제품을 전부 바꿀 필요는 없어요");
    const result = moisture.getByRole("status");
    for (const [feeling, expectedFeeling] of [
      ["번들거려요", "겹쳐 바르는 단계나 양"],
      ["당겨요", "세안 후 당김이 오래"],
      ["번들거리고 당겨요", "번들거림과 건조함은 함께"],
      ["잘 모르겠어요", "피부 타입을 지금 확정하지 않아도"],
    ]) {
      for (const [environment, expectedEnvironment] of [
        ["덥고 습해요", "무겁거나 끈적하게"],
        ["춥고 건조해요", "난방 환경"],
        ["실내·보통 환경이에요", "냉난방과 습도"],
      ]) {
        await moisture.getByRole("radio", { name: feeling, exact: true }).check();
        await moisture.getByRole("radio", { name: environment, exact: true }).check();
        await expect(result).toContainText(expectedFeeling);
        await expect(result).toContainText(expectedEnvironment);
        await expect(result).toContainText("잘 맞고 편안하다면 그대로 사용해도 괜찮아요");
      }
    }
    const feeling = moisture.getByRole("radio", { name: "번들거려요", exact: true });
    await feeling.focus();
    await page.keyboard.press("ArrowRight");
    await expect(moisture.getByRole("radio", { name: "당겨요", exact: true })).toBeChecked();
    await expect(moisture.getByRole("radio", { name: "당겨요", exact: true })).toBeFocused();
    const focusedBounds = await moisture
      .getByRole("radio", { name: "당겨요", exact: true })
      .boundingBox();
    expect(focusedBounds?.y).toBeGreaterThanOrEqual(80);
    expect((focusedBounds?.y ?? 0) + (focusedBounds?.height ?? 0)).toBeLessThanOrEqual(820);
    await moisture.getByRole("radio", { name: "춥고 건조해요", exact: true }).check();
    await result.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`guide-moisture-${width}.png`) });
    await expect(moisture).toContainText("피부 타입 진단이 아니에요");
    await page.reload();
    await expect(moisture.getByRole("radio", { name: "잘 모르겠어요", exact: true })).toBeChecked();
    await expect(
      moisture.getByRole("radio", { name: "실내·보통 환경이에요", exact: true }),
    ).toBeChecked();
    expect(writes).toEqual([]);
  });
}

for (const entry of ["/", "/catalog/products"]) {
  test(`guest enters the guide from ${entry} and returns`, async ({ page }) => {
    await page.goto(entry);
    await page.getByRole("link", { name: /스킨케어가 처음이라면/ }).click();
    await expect(page).toHaveURL(new RegExp(`${guidePath}$`));
    await expect(
      page.getByRole("heading", { name: "처음이라면, 기본부터", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "이전 페이지로 이동" }).click();
    await expect(page).toHaveURL(new RegExp(`${entry}$`));
    await expect(page.getByRole("link", { name: /스킨케어가 처음이라면/ })).toBeVisible();
  });
}
