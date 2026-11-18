import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { z } from "zod";
test.use({ trace: "off", baseURL: "http://localhost:3000" });
test.describe.configure({ mode: "serial" });
const statePath = `/tmp/sikin-dashboard-fixture-${randomUUID()}.json`;
const fixtureSchema = z.object({
  guestId: z.string(),
  guestProof: z.string(),
  strangerReportId: z.string(),
});
let fixture: z.infer<typeof fixtureSchema>;
function command(file: string, args: string[]): unknown {
  return JSON.parse(
    execFileSync(
      process.execPath,
      ["--conditions=react-server", "--import", "tsx", `tests/fixtures/${file}.ts`, ...args],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 15000 },
    ),
  );
}
function drive(action: string, id: string, stage = "") {
  return command("progress-data", [action, statePath, id, stage]);
}
test.beforeEach(async ({ context, baseURL }) => {
  fixture = fixtureSchema.parse(command("dashboard-data", ["initialize", statePath]));
  await context.addCookies(
    [
      { name: "x-guest-session-id", value: fixture.guestId },
      { name: "sikin_guest_proof", value: fixture.guestProof },
    ].map((c) => ({ ...c, url: baseURL!, httpOnly: true, sameSite: "Lax" as const })),
  );
});
test.afterEach(() => {
  if (fixture) command("dashboard-data", ["cleanup", statePath]);
});
for (const width of [320, 1280]) {
  test(`real SSE chunks show stages and truthful fallback at ${width}px`, async ({
    page,
  }, info) => {
    const { sessionId } = z.object({ sessionId: z.uuid() }).parse(drive("create", fixture.guestId));
    await page.setViewportSize({ width, height: 900 });
    let posts = 0;
    page.on("request", (r) => {
      if (r.url().endsWith("/api/v1/diagnostics/analyze")) posts++;
    });
    const response = page.waitForResponse((r) => r.url().endsWith(`/progress/${sessionId}`));
    await page.goto(`/diagnostic/progress?sessionId=${sessionId}`);
    const stream = await response;
    expect(stream.headers()["content-type"]).toContain("text/event-stream");
    expect(stream.headers()["x-accel-buffering"]).toBe("no");
    expect(stream.headers()["cache-control"]).toContain("no-transform");
    for (const step of [1, 2, 3]) {
      drive("notify", sessionId, String(step));
      await expect(
        page.locator('ol[aria-label="리포트 준비 단계"] > li[aria-current="step"]'),
      ).toContainText(
        ["사진 참고 정보 확인", "문진 응답 정리·결합", "리포트와 성분 안내 저장"][step - 1],
      );
      await expect(page.getByRole("progressbar")).toHaveAttribute(
        "value",
        String([35, 70, 95][step - 1]),
      );
    }
    await expect(page.getByText("사진 AI 미적용 · 문진만 사용", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const targets = await page.locator("button,a").evaluateAll(
      (nodes) =>
        nodes
          .filter((n) => n.getClientRects().length)
          .map((n) => n.getBoundingClientRect())
          .filter((r) => r.width < 44 || r.height < 44).length,
    );
    expect(targets).toBe(0);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await expect(page.getByRole("complementary", { name: "진단 전 안내" })).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath(`progress-${width}.png`), fullPage: true });
    const { reportId } = z
      .object({ reportId: z.uuid() })
      .parse(drive("complete", sessionId, "timeout"));
    await expect(page).toHaveURL(new RegExp(`/diagnostic/result/${reportId}$`), { timeout: 1000 });
    await expect(page.getByText("문진 기반 참고 리포트", { exact: true })).toBeVisible();
    expect(posts).toBe(0);
  });
}
test("three failed stream connections offer retry and real report recovery", async ({
  page,
}, info) => {
  const { sessionId } = z.object({ sessionId: z.uuid() }).parse(drive("create", fixture.guestId));
  await page.setViewportSize({ width: 320, height: 900 });
  let attempts = 0;
  await page.route("**/api/v1/diagnostics/progress/*", async (route) => {
    attempts++;
    return route.abort("failed");
  });
  await page.goto(`/diagnostic/progress?sessionId=${sessionId}`);
  await expect(
    page.getByRole("alert").filter({ hasText: "분석 진행 상태를 실시간으로 불러오지 못했습니다" }),
  ).toBeVisible();
  expect(attempts).toBe(3);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath("progress-error-320.png"), fullPage: true });
  let requests = 0;
  await page.route("**/api/v1/diagnostics/analyze", async (route) => {
    if (++requests === 1) return route.fulfill({ status: 503, json: { success: false } });
    return route.continue();
  });
  await page.getByRole("button", { name: "리포트 생성 상태 확인하기" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "피부 분석을 완료하지 못했습니다" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "리포트 생성 상태 확인하기" }).click();
  await expect(page).toHaveURL(/\/diagnostic\/result\/[a-f0-9-]+$/);
  expect(requests).toBe(2);
});
test("invalid progress links return to the questionnaire", async ({ page }) => {
  await page.goto("/diagnostic/progress?sessionId=not-a-uuid");
  await expect(page).toHaveURL(/\/diagnostic$/);
});
