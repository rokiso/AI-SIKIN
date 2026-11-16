import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { z } from "zod";
import { getKstDate } from "../lib/dashboard/date";
test.use({ trace: "off" });
let statePath: string;
function fixture(action: string): unknown {
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        "tests/fixtures/snapshot-data.ts",
        action,
        statePath,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ),
  );
}
test.beforeEach(async ({ context, baseURL }) => {
  statePath = `/tmp/sikin-snapshot-test-${randomUUID()}.json`;
  const { token } = z.object({ token: z.string() }).parse(fixture("initialize"));
  await context.addCookies([
    {
      name: "app_session_token",
      value: token,
      url: baseURL ?? "http://127.0.0.1:3000",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
});
test.afterEach(() => {
  fixture("cleanup");
});
for (const width of [320, 1280]) {
  test(`calendar month navigation, private timeline and retry at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const current = getKstDate().slice(0, 7);
    let calls = 0;
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("https://calendar-vault.invalid/**", (route) =>
      route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#ecfdf5"/></svg>',
      }),
    );
    await page.route("**/api/v1/snapshots/monthly?**", async (route) => {
      calls++;
      if (calls === 1) {
        await gate;
        return route.fulfill({
          status: 503,
          json: { success: false, error: { code: "MONTHLY_UNAVAILABLE" } },
        });
      }
      const query = new URL(route.request().url()).searchParams;
      const year = Number(query.get("year"));
      const month = Number(query.get("month"));
      const prefix = `${year}-${String(month).padStart(2, "0")}`;
      const snapshots =
        prefix !== current
          ? []
          : [1, 2].map((day) => ({
              id: `fixture-${day}`,
              recordDate: `${prefix}-0${day}`,
              createdAt: `${prefix}-0${day}T00:00:00Z`,
              feedbackSource: day === 1 ? "AI" : "GENERAL_GUIDANCE",
              feedbackComment: day === 1 ? "시험용 사진 참고 피드백" : "시험용 일반 관리 안내",
              conditions:
                day === 1
                  ? { hydrationLevel: "LOW", soothingLevel: "BALANCED", sebumLevel: "HIGH" }
                  : null,
              thumbnailUrl: `https://calendar-vault.invalid/${day}?revision=${calls}`,
            }));
      return route.fulfill({
        json: {
          success: true,
          data: {
            year,
            month,
            today: getKstDate(),
            snapshots,
            totalRecordedDays: snapshots.length,
            todayRecorded: false,
            currentStreakDays: 3,
            urlExpiresAt: new Date(Date.now() + 300000).toISOString(),
          },
        },
      });
    });
    await page.goto("/snapshot");
    const history = page.getByRole("region", { name: "피부 기록 캘린더" });
    await expect(history.getByRole("status", { name: "월별 기록 불러오는 중" })).toBeVisible();
    release?.();
    await expect(history.getByRole("alert")).toContainText("스냅샷 기록을 불러오지 못했습니다");
    await history.getByRole("button", { name: "다시 시도", exact: true }).click();
    await expect(history.getByRole("heading", { name: `${current}-02 피부 기록` })).toBeVisible();
    await expect(history.getByText("AI 측정값이 없는 기록입니다.", { exact: false })).toBeVisible();
    await history.getByRole("button", { name: `${current}-01 기록 있음` }).click();
    await expect(history.getByRole("heading", { name: `${current}-01 피부 기록` })).toBeVisible();
    await expect(history.getByRole("heading", { name: `${current}-01 피부 기록` })).toBeFocused();
    await expect(history.getByRole("listitem").filter({ hasText: "수분 낮음" })).toBeVisible();
    await expect(history.getByText("진정 균형", { exact: true })).toBeVisible();
    const cells = history.locator(
      'button[aria-label*="기록 있음"], button[aria-label*="기록 없음"]',
    );
    const sizes = await cells.evaluateAll((buttons) =>
      buttons.map((button) => ({
        w: button.getBoundingClientRect().width,
        h: button.getBoundingClientRect().height,
      })),
    );
    expect(sizes.every((size) => size.w >= 44 && size.h >= 44)).toBe(true);
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
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      const heading = document.getElementById("snapshot-history-heading");
      if (heading) window.scrollTo(0, window.scrollY + heading.getBoundingClientRect().top - 100);
    });
    await page.screenshot({ path: testInfo.outputPath(`calendar-${width}.png`) });
    await history.getByRole("button", { name: "다음 달", exact: true }).click();
    await expect(
      history.getByText("이번 달에 기록된 피부 스냅샷이 없습니다.", { exact: false }),
    ).toBeVisible();
    await expect(
      history.getByRole("link", { name: "오늘 스냅샷 기록하기", exact: true }),
    ).toHaveAttribute("href", "/snapshot#snapshot-recording");
    await history.getByRole("button", { name: "이전 달", exact: true }).click();
    await expect(history.getByRole("heading", { name: `${current}-02 피부 기록` })).toBeVisible();
    await page.route("**/api/v1/snapshots/monthly?**", (route) =>
      route.fulfill({ status: 401, json: { success: false, error: { code: "UNAUTHORIZED" } } }),
    );
    await history.getByRole("button", { name: "사진과 기록 새로 불러오기" }).click();
    await expect(
      history.getByText("데일리 피부 기록은 로그인 후 이용할 수 있습니다."),
    ).toBeVisible();
    await expect(history.getByRole("heading", { name: `${current}-02 피부 기록` })).toHaveCount(0);
  });
}
