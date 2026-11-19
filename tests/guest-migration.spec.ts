import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { z } from "zod";
// Synthetic local sessions only. OAuth exchange + migration are covered in DB integration tests.
// NextURL normalizes loopback IPs to localhost; match the origin for real POSTs.
test.use({ trace: "off", baseURL: "http://localhost:3000" });
const path = `/tmp/sikin-dashboard-fixture-${randomUUID()}.json`;
const fixtureSchema = z.object({
  token: z.string(),
  guestId: z.string(),
  guestProof: z.string(),
  memberReportId: z.string(),
});
let fixture: z.infer<typeof fixtureSchema>;
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
  fixture = fixtureSchema.parse(command("initialize"));
});
test.afterAll(() => {
  if (fixture) command("cleanup");
});
test("guest issuance keeps its identity and signed lifetime across explicit retries", async ({
  page,
  context,
}) => {
  await page.goto("/diagnostic");
  const before = (await context.cookies()).find((c) => c.name === "x-guest-session-id");
  expect(before?.httpOnly).toBe(true);
  expect(before?.secure).toBe(true);
  const result = await page.evaluate(async () => {
    const r = await fetch("/api/v1/auth/guest-session", { method: "POST" });
    return { status: r.status, body: await r.json() };
  });
  expect(result.status).toBe(200);
  expect(result.body.data.guestDeviceId).toBe(before?.value);
  expect(result.body.data.expiresInSeconds).toBeGreaterThan(2591900);
  const after = (await context.cookies()).find((c) => c.name === "x-guest-session-id");
  expect(after?.value).toBe(before?.value);
});
for (const width of [360, 1280]) {
  test(`member landing expires guest cookies and shows a confirmed notice at ${width}px`, async ({
    page,
    context,
    baseURL,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    if (!baseURL) throw new Error("Base URL required");
    await context.addCookies(
      [
        { name: "app_session_token", value: fixture.token },
        { name: "x-guest-session-id", value: fixture.guestId },
        { name: "sikin_guest_proof", value: fixture.guestProof },
        { name: "miruvia_migration_notice", value: "1" },
      ].map((c) => ({ ...c, url: baseURL, httpOnly: true, sameSite: "Lax" as const })),
    );
    await page.goto("/mypage");
    const notice = page.getByRole("status", { name: "기록 연결 완료" });
    await expect(notice).toContainText("회원 계정으로 안전하게 연결되었습니다.");
    const cookies = await context.cookies();
    expect(cookies.some((c) => c.name === "x-guest-session-id")).toBe(false);
    expect(cookies.some((c) => c.name === "sikin_guest_proof")).toBe(false);
    expect(cookies.some((c) => c.name === "app_session_token")).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const size = await notice.getByRole("button").boundingBox();
    expect(size?.width).toBeGreaterThanOrEqual(44);
    expect(size?.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: info.outputPath(`guest-member-notice-${width}.png`) });
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await expect(notice).toHaveCount(0, { timeout: 5000 });
    const response = await page.evaluate(async () => {
      const r = await fetch("/api/v1/auth/guest-session", { method: "POST" });
      return { status: r.status, body: await r.json() };
    });
    expect(response.status).toBe(409);
    await page.reload();
    expect((await context.cookies()).some((c) => c.name === "x-guest-session-id")).toBe(false);
  });
}
test("a forged migration notice is not shown to an anonymous visitor", async ({
  page,
  context,
  baseURL,
}) => {
  if (!baseURL) throw new Error("Base URL required");
  await context.addCookies([
    { name: "miruvia_migration_notice", value: "1", url: baseURL, httpOnly: true, sameSite: "Lax" },
  ]);
  await page.goto("/mypage");
  await expect(page.getByRole("status", { name: "기록 연결 완료" })).toHaveCount(0);
});
