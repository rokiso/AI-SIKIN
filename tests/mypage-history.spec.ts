import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
const firstId = "12345678-1234-4234-8234-123456789012";
const secondId = "12345678-1234-4234-8234-123456789013";
for (const width of [320, 375, 430, 1280]) {
  test(`history retry, pagination, report dialog and snapshot tabs at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    let calls = 0;
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let forceGuest = false;
    let moreFailed = false;
    await page.route("https://history-vault.invalid/**", (route) =>
      route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" fill="#ecfdf5"/></svg>',
      }),
    );
    await page.route("**/api/v1/users/me/history?**", async (route) => {
      calls++;
      if (calls === 1) {
        await gate;
        return route.fulfill({
          status: 503,
          json: { success: false, error: { code: "MYPAGE_HISTORY_FETCH_FAILED" } },
        });
      }
      const params = new URL(route.request().url()).searchParams;
      const snapshots = params.get("tab") === "snapshots";
      const older = params.has("cursor");
      if (older && !moreFailed) {
        moreFailed = true;
        return route.fulfill({
          status: 503,
          json: { success: false, error: { code: "MYPAGE_HISTORY_FETCH_FAILED" } },
        });
      }
      const report = {
        reportId: older ? secondId : firstId,
        sessionId: randomUUID(),
        baumannType: "DSNT",
        baumannNameKo: "건성 민감 색소침착 고민 적음 탄력 피부",
        diagnosedAt: "2026-11-01T15:30:00Z",
        summary: older ? "이전의 테스트 기록" : "저장된 피부 상태를 확인하는 테스트 기록",
        recommendedIngredients: ["판테놀"],
        cautionIngredients: ["향료"],
        axisScores: { oiliness: 20, sensitivity: 75, pigmentation: 30, elasticity: 40 },
        overallScore: null,
      };
      return route.fulfill({
        json: {
          success: true,
          data: {
            user: {
              isAuthenticated: !forceGuest,
              userId: forceGuest ? null : "test-user",
              nickname: "보관함 검증",
              email: null,
            },
            diagnostics: {
              totalCount: snapshots ? 0 : 2,
              items: snapshots ? [] : [report],
              nextCursor: snapshots || older ? null : firstId,
            },
            snapshots: {
              totalCount: snapshots && !forceGuest ? 1 : 0,
              items:
                snapshots && !forceGuest
                  ? [
                      {
                        snapshotId: firstId,
                        recordDate: "2026-11-02",
                        createdAt: "2026-11-01T15:30:00Z",
                        thumbnailUrl: "https://history-vault.invalid/image",
                        feedbackComment: "일반 보습 안내",
                        feedbackSource: "GENERAL_GUIDANCE",
                        conditions: null,
                      },
                    ]
                  : [],
              nextCursor: null,
            },
          },
        },
      });
    });
    await page.goto("/mypage");
    const history = page.getByRole("region", { name: "내 피부 이력 보관함" });
    await expect(history.getByRole("status")).toContainText("이력을 불러오고 있어요");
    release?.();
    await expect(history.getByRole("alert")).toContainText("이력 정보를 불러오지 못했습니다");
    await history.getByRole("button", { name: "다시 시도" }).click();
    const card = history.getByRole("button", { name: /저장된 피부 상태를 확인하는 테스트 기록/ });
    await expect(card).toBeVisible();
    await card.click();
    const dialog = page.getByRole("dialog", { name: "피부 분석 리포트 상세" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("판테놀", { exact: true })).toBeVisible();
    await expect(dialog.getByText("향료", { exact: true })).toBeVisible();
    await expect(dialog.getByText("DSNT", { exact: true })).toHaveCount(0);
    expect(
      await dialog.getByRole("meter", { name: "유분 지표" }).getAttribute("aria-valuenow"),
    ).toBe("20");
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`history-dialog-${width}.png`) });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(card).toBeFocused();
    await history.getByRole("button", { name: "이전 기록 더 보기" }).click();
    await expect(history.getByRole("alert")).toContainText("이전 기록을 불러오지 못했습니다");
    await expect(card).toBeVisible();
    await history.getByRole("button", { name: "다시 시도", exact: true }).click();
    await expect(history.getByText("이전의 테스트 기록")).toBeVisible();
    await expect(history.getByRole("status")).toContainText("2개 중 2개");
    await history.getByRole("tab", { name: "데일리 기록" }).click();
    await expect(history.getByText("일반 보습 안내")).toBeVisible();
    await expect(history.getByText("AI 측정값이 없는 일반 관리 안내입니다.")).toBeVisible();
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
    await page.screenshot({ path: testInfo.outputPath(`history-snapshot-${width}.png`) });
    forceGuest = true;
    await history.getByRole("button", { name: "사진과 기록 새로 불러오기" }).click();
    await expect(
      history.getByText("데일리 피부 기록은 로그인 후 이용할 수 있습니다."),
    ).toBeVisible();
    await expect(history.getByText("일반 보습 안내")).toHaveCount(0);
  });
}

test("empty report and snapshot tabs offer the corresponding next step", async ({ page }) => {
  await page.route("**/api/v1/users/me/history?**", (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          user: { isAuthenticated: true, userId: "test-user", nickname: "테스트", email: null },
          diagnostics: { totalCount: 0, items: [], nextCursor: null },
          snapshots: { totalCount: 0, items: [], nextCursor: null },
        },
      },
    }),
  );
  await page.goto("/mypage");
  const history = page.getByRole("region", { name: "내 피부 이력 보관함" });
  await expect(history.getByText("아직 완료된 피부 분석 리포트가 없습니다.")).toBeVisible();
  await expect(
    history.getByRole("link", { name: "피부 분석 시작하기", exact: true }),
  ).toHaveAttribute("href", "/diagnostic");
  await history.getByRole("tab", { name: "데일리 기록" }).click();
  await expect(history.getByText("매일 피부를 기록하고 변화를 확인해보세요.")).toBeVisible();
  await expect(
    history.getByRole("link", { name: "오늘의 피부 기록하기", exact: true }),
  ).toHaveAttribute("href", "/snapshot");
});
