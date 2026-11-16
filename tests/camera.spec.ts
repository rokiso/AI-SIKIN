import { expect, test } from "@playwright/test";
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
    await expect(page.getByText(/이미지 전송 중 네트워크 오류가 발생했습니다/)).toBeVisible();
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
test("dark frame warning permits retake or proceed, and navigation stops camera", async ({
  page,
}) => {
  await syntheticCamera(page, true);
  await openCamera(page);
  await page.getByRole("button", { name: "촬영", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "다시 촬영하기" }).click();
  await expect(page.getByRole("button", { name: "촬영", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "촬영", exact: true }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "그대로 진행하기" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "다시 촬영", exact: true }).click();
  await expect(page.getByRole("button", { name: "촬영", exact: true })).toBeEnabled();
  await page
    .getByRole("navigation", { name: "주요 메뉴" })
    .getByRole("link", { name: "화장품", exact: true })
    .click();
  await expect(page).toHaveURL(/\/catalog\/products$/);
  await expect.poll(() => streamsStopped(page)).toBe(true);
});
