import { consentedPhotoActor } from "./fixtures/consent-browser";
import { expect, test } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await consentedPhotoActor(page);
});
import AxeBuilder from "@axe-core/playwright";
import { syntheticCamera, streamsStopped } from "./fixtures/camera-browser";
async function openCamera(page: import("@playwright/test").Page) {
  await page.goto("/diagnostic");
  await page.getByRole("button", { name: "카메라로 촬영하기", exact: true }).click();
  await page.getByRole("button", { name: "카메라 켜기", exact: true }).click();
  await expect(page.getByRole("button", { name: "촬영", exact: true })).toBeEnabled();
}
for (const width of [320, 1280])
  test(`camera guide, switch, capture and upload at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await syntheticCamera(page);
    await openCamera(page);
    await expect(page.getByText(/얼굴을 타원형 가이드 안에 맞춰주세요/)).toBeVisible();
    await page.getByRole("button", { name: "전면/후면 카메라 전환" }).click();
    await expect(page.getByRole("button", { name: "촬영", exact: true })).toBeEnabled();
    expect(await page.evaluate(() => window.cameraFacings)).toEqual(["user", "environment"]);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: test.info().outputPath(`camera-${width}.png`), fullPage: true });
    await page.getByRole("button", { name: "촬영", exact: true }).click();
    const preview = page.getByAltText("촬영한 얼굴 사진 미리보기");
    await expect(preview).toBeVisible({ timeout: 15000 });
    expect(
      await preview.evaluate((image) =>
        image instanceof HTMLImageElement ? [image.naturalWidth, image.naturalHeight] : [],
      ),
    ).toEqual([1280, 960]);
    expect(await streamsStopped(page)).toBe(true);
    const old = await preview.getAttribute("src");
    await page.getByRole("button", { name: "다시 촬영", exact: true }).click();
    await expect(page.getByRole("button", { name: "촬영", exact: true })).toBeEnabled();
    expect(await page.evaluate((url) => window.cameraRevoked?.includes(url!), old)).toBe(true);
    await page.getByRole("button", { name: "촬영", exact: true }).click();
    await expect(preview).toBeVisible({ timeout: 15000 });
    const steps: string[] = [];
    let failed = false;
    const id = "12345678-1234-4234-8234-123456789012";
    const key = `raw-faces/${id}.jpeg`;
    const cors = {
      "access-control-allow-origin": "http://127.0.0.1:3000",
      "access-control-allow-methods": "PUT, OPTIONS",
      "access-control-allow-headers": "content-type,x-amz-server-side-encryption",
      "access-control-expose-headers": "ETag",
    };
    await page.route("**/api/v1/diagnostics/upload-url", (route) => {
      steps.push("link");
      return route.fulfill({
        status: 201,
        json: {
          success: true,
          data: {
            uploadSessionId: id,
            s3Key: key,
            uploadUrl: "https://camera-vault.invalid/photo",
            expiresInSeconds: 900,
          },
        },
      });
    });
    await page.route("https://camera-vault.invalid/**", (route) => {
      if (route.request().method() === "OPTIONS")
        return route.fulfill({ status: 204, headers: cors });
      expect(route.request().headers()["x-amz-server-side-encryption"]).toBe("AES256");
      steps.push("transfer");
      if (!failed) {
        failed = true;
        return route.abort("internetdisconnected");
      }
      return route.fulfill({
        status: 200,
        headers: { ...cors, ETag: '"0123456789abcdef0123456789abcdef"' },
        body: "",
      });
    });
    await page.route("**/api/v1/diagnostics/upload-complete", (route) => {
      steps.push("confirm");
      return route.fulfill({
        json: {
          success: true,
          data: {
            uploadSessionId: id,
            status: "UPLOADED",
            s3Key: key,
            confirmedAt: new Date().toISOString(),
          },
        },
      });
    });
    await page.getByRole("button", { name: "이 사진으로 진단 시작" }).click();
    await expect(page.getByText(/사진 전송 중 네트워크 연결이 끊어졌습니다/)).toBeVisible();
    await page.getByRole("button", { name: "다시 시도", exact: true }).click();
    await expect(
      page.getByText("사진 업로드가 완료되었습니다. 아래에서 문진으로 이어가세요."),
    ).toBeVisible();
    expect(steps).toEqual(["link", "transfer", "link", "transfer", "confirm"]);
    await page.getByRole("button", { name: "앨범에서 사진 선택하기" }).click();
    expect(await streamsStopped(page)).toBe(true);
  });
test("permission denial offers album fallback", async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: () => Promise.reject(new DOMException("Denied", "NotAllowedError")),
    }),
  );
  await page.goto("/diagnostic");
  await page.getByRole("button", { name: "카메라로 촬영하기" }).click();
  await page.getByRole("button", { name: "카메라 켜기" }).click();
  await expect(
    page.getByText(/카메라 접근 권한이 거부되었거나 지원되지 않는 기기입니다/),
  ).toBeVisible();
  await page.getByRole("button", { name: "앨범에서 사진 선택하기" }).click();
  await expect(page.getByRole("button", { name: "앨범에서 사진 선택", exact: true })).toBeVisible();
});
for (const width of [320, 1280]) {
  test(`dark frame blocks upload and returns to the live viewfinder at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await syntheticCamera(page, true);
    let requests = 0;
    await page.route("**/api/v1/diagnostics/upload-url", (route) => {
      requests++;
      return route.abort();
    });
    await openCamera(page);
    const shutter = page.getByRole("button", { name: "촬영", exact: true });
    await shutter.click();
    const dialog = page.getByRole("dialog", { name: "주변이 너무 어두워요" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/빛이 고르게/)).toBeVisible();
    const retry = dialog.getByRole("button", { name: "다시 촬영하기" });
    const box = await retry.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    await retry.click();
    await expect(shutter).toBeFocused();
    await expect(shutter).toBeEnabled();
    await shutter.click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(shutter).toBeFocused();
    expect(requests).toBe(0);
    expect(await page.evaluate(() => window.cameraStreams?.length)).toBe(1);
    await page
      .getByRole("navigation", { name: "주요 메뉴" })
      .getByRole("link", { name: "화장품", exact: true })
      .click();
    await expect(page).toHaveURL(/\/catalog\/products$/);
    await expect.poll(() => streamsStopped(page)).toBe(true);
  });
}

for (const [defect, title] of [
  ["no-face", "얼굴을 찾을 수 없어요"],
  ["blur", "초점이 흔들렸어요"],
] as const) {
  test(`camera blocks ${defect} and offers the album`, async ({ page }) => {
    await syntheticCamera(page, false, defect);
    await openCamera(page);
    await page.getByRole("button", { name: "촬영", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: title });
    await expect(dialog).toBeVisible();
    await expect(page.getByAltText("촬영한 얼굴 사진 미리보기")).toHaveCount(0);
    await dialog.getByRole("button", { name: "앨범에서 선택하기" }).click();
    await expect(
      page.getByRole("button", { name: "앨범에서 사진 선택", exact: true }),
    ).toBeVisible();
    expect(await streamsStopped(page)).toBe(true);
  });
}
