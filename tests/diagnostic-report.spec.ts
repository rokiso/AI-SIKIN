import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { z } from "zod";
import { baumannQuestions } from "../lib/diagnostic/baumannData";
import { reportSchema } from "../lib/diagnostic/report-types";

// NextURL normalizes loopback IPs to localhost. Use the same origin for real POSTs.
test.use({ trace: "off", baseURL: "http://localhost:3000" });
test.describe.configure({ mode: "serial" });
const statePath = `/tmp/sikin-dashboard-fixture-${randomUUID()}.json`;
const fixtureSchema = z.object({
  token: z.string(),
  guestId: z.string(),
  guestProof: z.string(),
  strangerReportId: z.string(),
  guestReportId: z.string(),
});
let fixture: z.infer<typeof fixtureSchema>;
function fixtureCommand(action: string): unknown {
  const output = execFileSync(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      "tests/fixtures/dashboard-data.ts",
      action,
      statePath,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 15000 },
  );
  return JSON.parse(output);
}
test.beforeAll(() => {
  fixture = fixtureSchema.parse(fixtureCommand("initialize"));
});
test.afterAll(() => {
  if (fixture) fixtureCommand("cleanup");
});
function trackSession(id: string) {
  const state = z
    .object({ userIds: z.array(z.uuid()), diagnosticIds: z.array(z.uuid()) })
    .parse(JSON.parse(readFileSync(statePath, "utf8")));
  state.diagnosticIds.push(z.uuid().parse(id));
  writeFileSync(statePath, JSON.stringify(state), { mode: 0o600 });
}
async function identify(context: BrowserContext, baseURL: string, member = false) {
  const cookies = member
    ? [{ name: "app_session_token", value: fixture.token }]
    : [
        { name: "x-guest-session-id", value: fixture.guestId },
        { name: "sikin_guest_proof", value: fixture.guestProof },
      ];
  await context.addCookies(
    cookies.map((c) => ({ ...c, url: baseURL, httpOnly: true, sameSite: "Lax" as const })),
  );
}
async function verifyLayout(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const undersized = await page.locator("a,button").evaluateAll(
    (controls) =>
      controls
        .filter((c) => c.getClientRects().length)
        .map((c) => c.getBoundingClientRect())
        .filter((b) => b.width < 44 || b.height < 44).length,
  );
  expect(undersized).toBe(0);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
}
for (const width of [320, 1280]) {
  test(`real questionnaire report, chart and disclaimer at ${width}px`, async ({
    page,
    context,
    baseURL,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await identify(context, baseURL!);
    const survey = await page.request.post("/api/v1/diagnostics/survey-answers", {
      headers: { origin: baseURL! },
      data: {
        requestId: randomUUID(),
        answers: baumannQuestions.map((q) => ({ questionId: q.id, selectedChoice: 2 })),
      },
    });
    expect(survey.status()).toBe(201);
    const sessionId = (await survey.json()).data.sessionId;
    trackSession(sessionId);
    const response = await page.request.post("/api/v1/diagnostics/analyze", {
      headers: { origin: baseURL! },
      data: { sessionId },
    });
    expect(response.status()).toBe(200);
    const report = reportSchema.parse((await response.json()).data);
    await page.goto(`/diagnostic/result/${report.reportId}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "건성 저항성 색소침착 고민 적음 탄력 피부" }),
    ).toBeVisible();
    await expect(page.getByText("문진 기반 참고 리포트", { exact: true })).toBeVisible();
    await expect(
      page.getByText("사진 AI 분석을 적용하지 않았습니다.", { exact: false }),
    ).toBeVisible();
    await expect(page.getByRole("img", { name: /레이더 차트/ })).toBeVisible();
    await expect(
      page
        .getByRole("article")
        .filter({ has: page.getByRole("heading", { level: 1 }) })
        .getByText("세라마이드", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("DRNT", { exact: false })).toHaveCount(0);
    await expect(page.getByText("종합점수", { exact: false })).toHaveCount(0);
    const disclaimer = page.getByRole("complementary", { name: "진단 전 안내" });
    await disclaimer.scrollIntoViewIfNeeded();
    await expect(disclaimer).toBeVisible();
    await expect(disclaimer).toContainText("의학적 진단이 아닌");
    await verifyLayout(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath(`report-${width}.png`), fullPage: true });
    await page.getByRole("button", { name: "로그인하고 결과 보관하기" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    const replay = await page.request.post("/api/v1/diagnostics/analyze", {
      headers: { origin: baseURL! },
      data: { sessionId },
    });
    expect((await replay.json()).data.reportId).toBe(report.reportId);
  });
}
test("analysis failure, pending, retry and navigation from saved questionnaire", async ({
  page,
  context,
  baseURL,
}, info) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await identify(context, baseURL!, true);
  await page.goto("/diagnostic");
  await page.getByRole("button", { name: "문진 먼저 시작하기" }).click();
  for (let step = 1; step <= 12; step++) {
    await expect(page.getByRole("progressbar")).toHaveAttribute("value", String(step));
    await page.getByRole("radio").first().check();
  }
  const saved = page.waitForResponse("**/api/v1/diagnostics/survey-answers");
  await page.getByRole("button", { name: "문진 완료하기" }).click();
  trackSession((await (await saved).json()).data.sessionId);
  await expect(page.getByRole("heading", { name: "문진 응답을 저장했어요" })).toBeVisible();
  let calls = 0;
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/diagnostics/analyze", async (route) => {
    calls++;
    if (calls === 1)
      return route.fulfill({
        status: 503,
        json: { success: false, error: { code: "REPORT_UNAVAILABLE" } },
      });
    if (calls === 2) {
      await pending;
      await route.fetch();
      return route.fulfill({
        status: 202,
        json: {
          success: true,
          data: { status: "ANALYSIS_PENDING", sessionId: route.request().postDataJSON().sessionId },
        },
      });
    }
    return route.continue();
  });
  await page.getByRole("button", { name: "피부 리포트 보기" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "피부 분석을 완료하지 못했습니다" }),
  ).toBeVisible();
  await verifyLayout(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath("report-retry-320.png"), fullPage: true });
  await page.getByRole("button", { name: "리포트 생성 상태 확인하기" }).click();
  await expect(page.getByRole("button", { name: "리포트 준비 중…" })).toBeDisabled();
  await expect(page.getByRole("status").filter({ hasText: "문진을 정리하고" })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath("report-pending-320.png"), fullPage: true });
  release();
  await expect(page).toHaveURL(/\/diagnostic\/result\/[0-9a-f-]+$/);
  await expect(page.getByRole("link", { name: "보관함에서 확인하기" })).toBeVisible();
  expect(calls).toBe(2);
  await verifyLayout(page);
});
test("forbidden and missing reports show recovery without leaking other owners", async ({
  page,
  context,
  baseURL,
}, info) => {
  await identify(context, baseURL!);
  await page.setViewportSize({ width: 320, height: 900 });
  const forbidden = await page.request.get(
    `/api/v1/diagnostics/reports/${fixture.strangerReportId}`,
  );
  expect(forbidden.status()).toBe(403);
  expect(forbidden.headers()["cache-control"]).toBe("private, no-store");
  await page.goto(`/diagnostic/result/${fixture.strangerReportId}`);
  await expect(page.getByRole("heading", { name: "리포트를 확인할 수 없어요" })).toBeVisible();
  await expect(page.getByText("다른 사용자에게 귀속된 비공개 요약입니다.")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "보관함으로" })).toBeVisible();
  await verifyLayout(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath("report-forbidden-320.png"), fullPage: true });
  await page.goto(`/diagnostic/result/${randomUUID()}`);
  await expect(
    page.getByRole("alert").filter({ hasText: "리포트를 찾을 수 없습니다" }),
  ).toBeVisible();
});
