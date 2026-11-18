import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { syntheticCamera } from "./fixtures/camera-browser";
test.use({ trace: "off", baseURL: "http://localhost:3000" });
const terms = {
  termsId: "11111111-1111-4111-8111-111111111111",
  consentType: "BIOMETRIC_FACE_DATA",
  version: "test-v1",
  title: "로컬 검증용 동의 약관",
  contentMarkdown:
    "수집 항목: 테스트용 얼굴 사진과 외관 참고 정보.\n목적: 로컬 기능 검증.\n보관 및 이용 기간: 테스트 종료 후 fixture 정리. 실제 서비스 동의가 아닙니다.\n거부 권리: 사진 기능을 거부해도 문진만 이용할 수 있습니다.",
  enactedAt: "2026-11-18T00:00:00.000Z",
};
for (const width of [320, 1280]) {
  test(`camera waits for recorded consent; rejection, retry and keyboard access at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await syntheticCamera(page);
    let agreed = false;
    let calls = 0;
    let version = terms.version;
    await page.route("**/api/v1/consents/status", (route) =>
      route.fulfill({
        json: {
          success: true,
          data: {
            consentType: "BIOMETRIC_FACE_DATA",
            hasValidConsent: agreed,
            requiresReconsent: false,
            activeVersion: version,
            consentedVersion: agreed ? version : null,
            consentedAt: agreed ? "2026-11-18T00:00:00.000Z" : null,
          },
        },
      }),
    );
    await page.route("**/api/v1/consents/terms/latest", (route) =>
      route.fulfill({ json: { success: true, data: { ...terms, version } } }),
    );
    let release: () => void = () => {};
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/v1/consents", async (route) => {
      calls++;
      if (calls === 1) return route.fulfill({ status: 503, json: { success: false } });
      expect(route.request().postDataJSON()).toEqual({
        consentType: "BIOMETRIC_FACE_DATA",
        termsVersion: version,
        isAgreed: true,
      });
      await pending;
      agreed = true;
      return route.fulfill({
        status: 201,
        json: {
          success: true,
          data: { consentId: "22222222-2222-4222-8222-222222222222", version, isAgreed: true },
        },
      });
    });
    await page.goto("/diagnostic");
    await page.getByRole("button", { name: "카메라로 촬영하기", exact: true }).click();
    const start = page.getByRole("button", { name: "카메라 켜기", exact: true });
    await start.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    expect(await page.evaluate(() => window.cameraFacings)).toEqual([]);
    await expect(dialog.getByRole("button", { name: "동의하고 계속하기" })).toBeDisabled();
    await expect(dialog.getByRole("region", { name: "수집·이용 약관 전문" })).toContainText(
      "거부 권리",
    );
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    expect(await page.evaluate(() => window.cameraFacings)).toEqual([]);
    await expect(start).toBeFocused();
    await start.click();
    await dialog.getByRole("checkbox").check();
    await dialog.getByRole("button", { name: "동의하고 계속하기" }).click();
    await expect(dialog.getByRole("alert")).toContainText("동의 처리 중 오류가 발생했습니다");
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
    await page.screenshot({ path: info.outputPath(`consent-error-${width}.png`), fullPage: true });
    await dialog.getByRole("button", { name: "동의하고 계속하기" }).click();
    await expect(dialog.getByRole("button", { name: "동의 저장 중…" })).toBeDisabled();
    expect(await page.evaluate(() => window.cameraFacings)).toEqual([]);
    release();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("button", { name: "촬영", exact: true })).toBeEnabled();
    expect(calls).toBe(2);
    version = "test-v2";
    agreed = false;
    await page.getByRole("button", { name: "촬영", exact: true }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("checkbox")).not.toBeChecked();
    await expect(dialog).toContainText("test-v2");
    await page.keyboard.press("Escape");
  });
}
test("album selection sends no photo or creates no preview before consent; stale version requires a new checkbox", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 900 });
  let version = "test-v1";
  let writes = 0;
  const agreed = false;
  await page.route("**/api/v1/consents/status", (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          consentType: "BIOMETRIC_FACE_DATA",
          hasValidConsent: agreed,
          requiresReconsent: version === "test-v2",
          activeVersion: version,
          consentedVersion: version === "test-v2" ? "test-v1" : null,
          consentedAt: null,
        },
      },
    }),
  );
  await page.route("**/api/v1/consents/terms/latest", (route) =>
    route.fulfill({ json: { success: true, data: { ...terms, version } } }),
  );
  await page.route("**/api/v1/consents", (route) => {
    version = "test-v2";
    return route.fulfill({
      status: 409,
      json: { success: false, error: { code: "TERMS_VERSION_MISMATCH" } },
    });
  });
  page.on("request", (request) => {
    if (request.url().includes("/diagnostics/upload-") || request.method() === "PUT") writes++;
  });
  await page.goto("/diagnostic");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "앨범에서 사진 선택", exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: "face.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.concat([Buffer.from([255, 216, 255]), Buffer.alloc(11000)]),
  });
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  expect(writes).toBe(0);
  await expect(page.getByAltText("선택한 정면 사진 미리보기")).toHaveCount(0);
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "동의하고 계속하기" }).click();
  await expect(dialog).toContainText("test-v2");
  await expect(dialog.getByRole("checkbox")).not.toBeChecked();
  await expect(dialog.getByRole("button", { name: "동의하고 계속하기" })).toBeDisabled();
  await page.screenshot({ path: info.outputPath("consent-revision-320.png"), fullPage: true });
  await dialog.getByRole("button", { name: "취소하고 문진만 이용하기" }).click();
  expect(writes).toBe(0);
  await page.getByRole("button", { name: "문진 먼저 시작하기" }).click();
  await expect(page.getByRole("progressbar", { name: "문진 진행률" })).toBeVisible();
});
test("unpublished terms keep camera off and offer the questionnaire", async ({ page }) => {
  await syntheticCamera(page);
  await page.route("**/api/v1/consents/**", (route) =>
    route.fulfill({ status: 404, json: { success: false, error: { code: "TERMS_NOT_FOUND" } } }),
  );
  await page.goto("/diagnostic");
  await page.getByRole("button", { name: "카메라로 촬영하기", exact: true }).click();
  await page.getByRole("button", { name: "카메라 켜기", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("alert")).toContainText("약관을 준비하고 있습니다");
  expect(await page.evaluate(() => window.cameraFacings)).toEqual([]);
  await expect(dialog.getByRole("checkbox")).toHaveCount(0);
  await dialog.getByRole("button", { name: "취소하고 문진만 이용하기" }).click();
  await page.getByRole("button", { name: "문진 먼저 시작하기" }).click();
  await expect(page.getByRole("progressbar")).toBeVisible();
});

test("actual API records consent and prompts for an activated revision before capture", async ({
  page,
  context,
  baseURL,
}, info) => {
  const path = `/tmp/sikin-consent-fixture-${randomUUID()}.json`;
  function command(action: string): unknown {
    return JSON.parse(
      execFileSync(
        process.execPath,
        [
          "--conditions=react-server",
          "--import",
          "tsx",
          "tests/fixtures/biometric-consent-data.ts",
          action,
          path,
        ],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 15000 },
      ),
    );
  }
  const fixture = z
    .object({ guestId: z.uuid(), proof: z.string(), version: z.string() })
    .parse(command("initialize"));
  try {
    await context.addCookies(
      [
        { name: "x-guest-session-id", value: fixture.guestId },
        { name: "sikin_guest_proof", value: fixture.proof },
      ].map((cookie) => ({ ...cookie, url: baseURL!, httpOnly: true, sameSite: "Lax" as const })),
    );
    await syntheticCamera(page);
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto("/diagnostic");
    await page.getByRole("button", { name: "카메라로 촬영하기", exact: true }).click();
    await page.getByRole("button", { name: "카메라 켜기", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    expect(await page.evaluate(() => window.cameraFacings)).toEqual([]);
    await dialog.getByRole("checkbox").check();
    await dialog.getByRole("button", { name: "동의하고 계속하기" }).click();
    await expect(page.getByRole("button", { name: "촬영", exact: true })).toBeEnabled();
    expect(command("inspect")).toMatchObject({
      versions: [fixture.version],
      ipsUnavailable: true,
      uploads: 0,
    });
    const next = z.object({ version: z.string() }).parse(command("revision"));
    await page.getByRole("button", { name: "촬영", exact: true }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(next.version);
    await expect(dialog).toContainText("재동의가 필요합니다");
    await expect(dialog.getByRole("checkbox")).not.toBeChecked();
    await page.screenshot({
      path: info.outputPath("consent-real-revision-320.png"),
      fullPage: true,
    });
    await dialog.getByRole("checkbox").check();
    await dialog.getByRole("button", { name: "동의하고 계속하기" }).click();
    await expect(page.getByAltText("촬영한 얼굴 사진 미리보기")).toBeVisible();
    const records = z
      .object({ versions: z.array(z.string()), uploads: z.number() })
      .parse(command("inspect"));
    expect(records.versions.sort()).toEqual([fixture.version, next.version].sort());
    expect(records.uploads).toBe(0);
  } finally {
    command("cleanup");
  }
});
