import { randomUUID } from "node:crypto";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { z } from "zod";

// The isolated test sessions must not be persisted in HTTP trace artifacts.
test.use({ trace: "off" });
test.describe.configure({ mode: "serial" });

const fixtureSchema = z.object({
  memberId: z.string(), strangerId: z.string(), token: z.string(), expiredToken: z.string(), revokedToken: z.string(),
  guestId: z.string(), guestProof: z.string(), memberReportId: z.string(), guestReportId: z.string(), strangerReportId: z.string(), recordDate: z.string(),
});
type Fixture = z.infer<typeof fixtureSchema>;
let fixture: Fixture;
const fixturePath = `/tmp/sikin-dashboard-fixture-${randomUUID()}.json`;
const disclaimer = "본 서비스의 분석 및 추천 결과는 의료 진단이나 치료를 대체할 수 없으며, 일상 스킨케어 관리를 위한 가이드입니다.";

function fixtureCommand(action: string): unknown {
  const output = execFileSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "tests/fixtures/dashboard-data.ts", action, fixturePath], { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 15_000 });
  return JSON.parse(output) as unknown;
}

test.beforeAll(() => { fixture = fixtureSchema.parse(fixtureCommand("initialize")); });
test.afterAll(() => { if (fixture) fixtureCommand("cleanup"); });

async function setIdentity(context: BrowserContext, baseURL: string, type: "member" | "guest") {
  const cookies = type === "member"
    ? [{ name: "app_session_token", value: fixture.token }]
    : [{ name: "x-guest-session-id", value: fixture.guestId }, { name: "sikin_guest_proof", value: fixture.guestProof }];
  await context.addCookies(cookies.map((cookie) => ({ ...cookie, url: baseURL, httpOnly: true, sameSite: "Lax" as const })));
}

async function expectLayout(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const undersized = await page.locator("a, button").evaluateAll((controls) => controls.flatMap((control) => {
    const bounds = control.getBoundingClientRect();
    const style = getComputedStyle(control);
    if (style.display === "none" || style.visibility === "hidden" || !control.getClientRects().length) return [];
    return bounds.width < 44 || bounds.height < 44 ? [{ text: control.textContent, width: bounds.width, height: bounds.height }] : [];
  }));
  expect(undersized).toEqual([]);
  await expect(page.getByText(disclaimer, { exact: true })).toBeVisible();
  const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(accessibility.violations).toEqual([]);
}

for (const width of [320, 1280]) {
  test(`new visitors and verified guests see the appropriate dashboard at ${width}px`, async ({ page, context, baseURL }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const start = page.getByRole("link", { name: "무료 AI 피부 진단 시작하기", exact: true });
    await expect(start).toBeVisible();
    await expectLayout(page);
    await page.screenshot({ path: testInfo.outputPath(`new-visitor-${width}.png`), fullPage: true });
    await start.click();
    await expect(page).toHaveURL(/\/diagnostic$/);

    await context.clearCookies();
    await setIdentity(context, baseURL ?? "http://127.0.0.1:3000", "guest");
    await page.goto("/");
    await expect(page.getByText("DSPT", { exact: true })).toBeVisible();
    await expect(page.getByText("병풀추출물", { exact: true })).toBeVisible();
    await expect(page.getByText("서명 게스트 소유 피부 관리 요약입니다.", { exact: true })).toBeVisible();
    await expect(page.getByText("다른 사용자에게 귀속된 비공개 요약입니다.", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "오늘 스냅샷 남기기", exact: true })).toHaveCount(0);
    await expectLayout(page);
    await page.screenshot({ path: testInfo.outputPath(`guest-history-${width}.png`), fullPage: true });
  });
}

test("members see only their own report and a fresh snapshot after returning to the dashboard", async ({ page, context, baseURL }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await setIdentity(context, baseURL ?? "http://127.0.0.1:3000", "member");
  await page.goto("/");
  await expect(page.getByText("OSNW", { exact: true })).toBeVisible();
  await expect(page.getByText("판테놀", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "오늘 스냅샷 남기기", exact: true })).toBeVisible();
  await expectLayout(page);
  await page.screenshot({ path: testInfo.outputPath("member-snapshot-missing-320.png"), fullPage: true });

  await page.getByRole("link", { name: "오늘 스냅샷 남기기", exact: true }).click();
  await expect(page).toHaveURL(/\/snapshot$/);
  fixtureCommand("record");
  await page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("link", { name: "홈", exact: true }).click();
  await expect(page.getByText("오늘의 피부 기록 완료", { exact: true })).toBeVisible();
  await expect(page.getByText("오늘의 검증용 피부 피드백입니다.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "오늘 스냅샷 남기기", exact: true })).toHaveCount(0);
  await expectLayout(page);
  await page.screenshot({ path: testInfo.outputPath("member-snapshot-recorded-320.png"), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await expectLayout(page);
  await page.screenshot({ path: testInfo.outputPath("member-snapshot-recorded-1280.png"), fullPage: true });
});

test("summary projection ignores identity headers, rejects query selectors and scopes signed guests", async ({ context, baseURL }) => {
  const origin = baseURL ?? "http://127.0.0.1:3000";
  await setIdentity(context, origin, "guest");
  const response = await context.request.get("/api/v1/dashboard/summary", { headers: { "x-user-id": fixture.strangerId, "x-guest-session-id": fixture.memberId } });
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers().vary?.toLowerCase()).toContain("cookie");
  const body: unknown = await response.json();
  expect(body).toMatchObject({ success: true, data: { user: { isAuthenticated: false }, latestDiagnostic: { reportId: fixture.guestReportId, baumannType: "DSPT" }, todaySnapshot: { isRecorded: false } } });
  expect(JSON.stringify(body).includes(fixture.strangerReportId)).toBe(false);
  const selected = await context.request.get(`/api/v1/dashboard/summary?userId=${encodeURIComponent(fixture.strangerId)}`);
  expect(selected.status()).toBe(400);
  expect(await selected.json()).toMatchObject({ success: false, error: { code: "INVALID_DASHBOARD_REQUEST" } });
});

test("an attacker cannot exchange a stolen guest UUID for ownership proof", async ({ context, baseURL }) => {
  const origin = baseURL ?? "http://127.0.0.1:3000";
  await context.addCookies([{ name: "x-guest-session-id", value: fixture.guestId, url: origin }]);
  const response = await context.request.get("/api/v1/dashboard/summary");
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ success: true, data: { hasDiagnosticHistory: false, latestDiagnostic: null } });
  const issuedId = (await context.cookies()).find((cookie) => cookie.name === "x-guest-session-id")?.value;
  expect(issuedId === fixture.guestId).toBe(false);

  await context.clearCookies();
  const changedProof = `${fixture.guestProof.slice(0, -2)}aa`;
  await context.addCookies([{ name: "x-guest-session-id", value: fixture.guestId, url: origin }, { name: "sikin_guest_proof", value: changedProof, url: origin }]);
  const altered = await context.request.get("/api/v1/dashboard/summary");
  expect(await altered.json()).toMatchObject({ success: true, data: { hasDiagnosticHistory: false, latestDiagnostic: null } });
  expect((await context.cookies()).find((cookie) => cookie.name === "x-guest-session-id")?.value === fixture.guestId).toBe(false);
});

test("expired and revoked member credentials cannot reveal saved history", async ({ context, baseURL }) => {
  const origin = baseURL ?? "http://127.0.0.1:3000";
  for (const token of [fixture.expiredToken, fixture.revokedToken, "invalid-session"]) {
    await context.clearCookies();
    await context.addCookies([{ name: "app_session_token", value: token, url: origin }]);
    const response = await context.request.get("/api/v1/dashboard/summary");
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, data: { user: { isAuthenticated: false }, hasDiagnosticHistory: false, latestDiagnostic: null, todaySnapshot: { isRecorded: false } } });
  }
});

test.describe("dashboard database failure", () => {
  const origin = "http://127.0.0.1:3003";
  let server: ChildProcess | undefined;
  let startupError: Error | undefined;

  test.beforeAll(async () => {
    try {
      await fetch(origin, { signal: AbortSignal.timeout(500) });
      throw new Error("Dashboard test port is occupied; refusing to replace another process");
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
    }
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3003"], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: "postgresql://127.0.0.1:1/sikin_dashboard_unavailable" },
      stdio: "ignore",
    });
    server.once("error", (error) => { startupError = error; });
    await expect.poll(async () => {
      if (startupError || (server && server.exitCode !== null)) return "startup-failed";
      try { return (await fetch(origin)).ok ? "ready" : "pending"; }
      catch (error) { if (error instanceof TypeError) return "pending"; throw error; }
    }, { timeout: 20_000 }).toBe("ready");
  });

  test.afterAll(async () => {
    if (!server?.pid || server.exitCode !== null) return;
    const child = server;
    const exit = once(child, "exit");
    const forceStop = setTimeout(() => child.kill("SIGKILL"), 2_000);
    child.kill("SIGTERM");
    try { await exit; }
    finally { clearTimeout(forceStop); }
  });

  test("API errors stay safe and do not become empty success projections", async ({ request }) => {
    const response = await request.get(`${origin}/api/v1/dashboard/summary`);
    expect(response.status()).toBe(500);
    const body: unknown = await response.json();
    expect(body).toEqual({ success: false, error: { code: "DASHBOARD_FETCH_FAILED", message: "대시보드 요약 정보를 조회하는 중 서버 오류가 발생했습니다." } });
    expect(JSON.stringify(body).includes("127.0.0.1")).toBe(false);
    expect(JSON.stringify(body).includes("sikin_dashboard_unavailable")).toBe(false);
  });

  for (const width of [320, 1280]) {
    test(`failed summaries provide accessible retry at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(origin);
      const failure = page.getByRole("alert").filter({ hasText: "대시보드 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요." });
      await expect(failure).toBeVisible();
      const retry = failure.getByRole("button", { name: "다시 시도", exact: true });
      await expect(retry).toBeVisible();
      await retry.click();
      await expect(failure).toBeVisible();
      await expect(retry).toBeEnabled();
      await expectLayout(page);
      await page.screenshot({ path: testInfo.outputPath(`dashboard-failure-${width}.png`), fullPage: true });
    });
  }
});
