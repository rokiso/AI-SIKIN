import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { z } from "zod";
// Local synthetic account only; the final test permanently removes this fixture.
test.use({ trace: "off", baseURL: "http://localhost:3000" });
test.describe.configure({ mode: "serial" });
const path = `/tmp/sikin-dashboard-fixture-${randomUUID()}.json`;
const schema = z.object({ token: z.string() });
let fixture: z.infer<typeof schema>;
function command(action: string): unknown {
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        "tests/fixtures/dashboard-data.ts",
        action,
        path,
      ],
      { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 15000 },
    ),
  ) as unknown;
}
test.beforeAll(() => {
  fixture = schema.parse(command("initialize"));
});
test.afterAll(() => {
  if (fixture) command("cleanup");
});
for (const width of [320, 1280]) {
  test(`withdrawal confirmation, keyboard, retry and busy states at ${width}px`, async ({
    page,
    context,
    baseURL,
  }, info) => {
    if (!baseURL) throw new Error("Base URL required");
    await context.addCookies([
      {
        name: "app_session_token",
        value: fixture.token,
        url: baseURL,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/mypage");
    const opener = page.getByRole("button", { name: "회원 탈퇴", exact: true });
    await opener.click();
    const dialog = page.getByRole("dialog", { name: "회원 탈퇴" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("진단 이력 1건");
    const submit = dialog.getByRole("button", { name: "탈퇴 완료", exact: true });
    await expect(submit).toBeDisabled();
    await dialog.getByRole("checkbox").check();
    await expect(submit).toBeDisabled();
    await dialog.getByRole("textbox").fill("탈퇴");
    await expect(submit).toBeDisabled();
    await dialog.getByRole("textbox").fill("탈퇴합니다");
    await expect(submit).toBeEnabled();
    for (const control of await dialog.locator("button,input[type=text]").all()) {
      const size = await control.boundingBox();
      expect(size?.height).toBeGreaterThanOrEqual(44);
    }
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(opener).toBeFocused();
    await opener.click();
    await expect(dialog).toContainText("진단 이력 1건");
    await dialog.getByRole("checkbox").check();
    await dialog.getByRole("textbox").fill("탈퇴합니다");
    expect(
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze()
        .then((r) => r.violations),
    ).toEqual([]);
    await page.screenshot({ path: info.outputPath(`account-deletion-ready-${width}.png`) });
    const overflow = await dialog.evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(overflow).toBe(false);
    let release: () => void = () => {
      throw new Error("Not waiting");
    };
    let started: () => void = () => {};
    const waiting = new Promise<void>((resolve) => {
      started = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/v1/users/me", async (route) => {
      if (route.request().method() !== "DELETE") {
        await route.continue();
        return;
      }
      started();
      await gate;
      await route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          error: { code: "STORAGE_DELETION_FAILED", message: "mock" },
        }),
      });
    });
    await dialog.getByRole("button", { name: "탈퇴 완료", exact: true }).click();
    await waiting;
    await expect(dialog.getByRole("status")).toContainText("영구 삭제하는 중");
    await expect(dialog.getByRole("button", { name: "취소", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    await page.screenshot({ path: info.outputPath(`account-deletion-busy-${width}.png`) });
    release();
    await expect(dialog.getByRole("alert")).toContainText("계정은 유지되었습니다");
    await expect(dialog.getByRole("checkbox")).toBeChecked();
    await expect(dialog.getByRole("textbox")).toHaveValue("탈퇴합니다");
    await expect(dialog.getByRole("button", { name: "다시 시도", exact: true })).toBeEnabled();
    await page.screenshot({ path: info.outputPath(`account-deletion-error-${width}.png`) });
    await dialog.getByRole("button", { name: "취소", exact: true }).click();
    await expect(opener).toBeFocused();
  });
}
test("empty-account summary failures offer retry and never enable an unconfirmed deletion", async ({
  page,
  context,
  baseURL,
}) => {
  if (!baseURL) throw new Error("Base URL required");
  await context.addCookies([
    { name: "app_session_token", value: fixture.token, url: baseURL, httpOnly: true },
  ]);
  let count = 0;
  await page.route("**/api/v1/users/me", async (route) => {
    count++;
    await route.fulfill({
      status: count === 1 ? 503 : 200,
      contentType: "application/json",
      body: JSON.stringify(
        count === 1
          ? { success: false, error: { code: "UNAVAILABLE" } }
          : { success: true, data: { diagnostics: 0, snapshots: 0 } },
      ),
    });
  });
  await page.goto("/mypage");
  await page.getByRole("button", { name: "회원 탈퇴", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("alert")).toContainText("삭제할 기록 수를 확인하지 못했습니다.");
  await expect(dialog.getByRole("button", { name: "탈퇴 완료", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "기록 수 다시 확인" }).click();
  await expect(dialog).toContainText("진단 이력 0건");
});
test("real local erasure signs out, returns home and rejects the old token", async ({
  page,
  context,
  baseURL,
}) => {
  if (!baseURL) throw new Error("Base URL required");
  await context.addCookies([
    { name: "app_session_token", value: fixture.token, url: baseURL, httpOnly: true },
  ]);
  await page.goto("/mypage");
  await page.getByRole("button", { name: "회원 탈퇴", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("진단 이력 1건");
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("textbox").fill("탈퇴합니다");
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/api/v1/users/me") && r.request().method() === "DELETE",
  );
  await dialog.getByRole("button", { name: "탈퇴 완료", exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(dialog.getByRole("status")).toContainText("회원 탈퇴가 완료되었습니다");
  await expect(page).toHaveURL(`${baseURL}/`);
  expect((await context.cookies()).some((c) => c.name === "app_session_token")).toBe(false);
  const revoked = await page.request.get("/api/v1/users/me", {
    headers: { cookie: `app_session_token=${fixture.token}` },
  });
  expect(revoked.status()).toBe(401);
  await page.goto("/mypage");
  await expect(page.getByRole("button", { name: "회원 탈퇴", exact: true })).toHaveCount(0);
});
