import { jpeg } from "./fixtures/album-browser";
import { mockFaceDetector } from "./fixtures/face-detector-browser";
import { consentedPhotoActor } from "./fixtures/consent-browser";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await consentedPhotoActor(page);
  await mockFaceDetector(page);
});
test.use({ trace: "off" });
const id = "12345678-1234-4234-8234-123456789012";
const key = `raw-faces/${id}.jpeg`;
const etag = '"0123456789abcdef0123456789abcdef"';
const cors = {
  "access-control-allow-origin": "http://127.0.0.1:3000",
  "access-control-allow-methods": "PUT, OPTIONS",
  "access-control-allow-headers": "content-type,x-amz-server-side-encryption",
  "access-control-expose-headers": "ETag",
};
async function choosePhoto(
  page: Page,
  file: { name: string; mimeType: string; buffer: Buffer },
  confirm = true,
) {
  const picker = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /앨범에서 사진 선택|사진 다시 선택/ }).click();
  await (await picker).setFiles(file);
  if (confirm)
    await page.getByRole("button", { name: "보정 완료 및 사진 확정", exact: true }).click();
}
for (const width of [320, 1280]) {
  test(`album upload preprocesses EXIF and hands off confirmed session at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/diagnostic");
    const putCapture: { body: Buffer | null } = { body: null };
    let putType = "";
    let putEncryption = "";
    let issueSize = 0;
    let confirmBody: unknown = null;
    const order: string[] = [];
    let finish: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    await page.route("**/api/v1/diagnostics/upload-url", async (route) => {
      order.push("issue");
      issueSize = route.request().postDataJSON().fileSizeBytes;
      await route.fulfill({
        status: 201,
        json: {
          success: true,
          data: {
            uploadSessionId: id,
            s3Key: key,
            uploadUrl: "https://test-vault.invalid/photo",
            expiresInSeconds: 900,
          },
        },
      });
    });
    await page.route("https://test-vault.invalid/**", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers: cors });
        return;
      }
      order.push("put");
      putCapture.body = route.request().postDataBuffer();
      putType = route.request().headers()["content-type"];
      putEncryption = route.request().headers()["x-amz-server-side-encryption"];
      expect(route.request().headers()["cookie"]).toBeUndefined();
      await gate;
      await route.fulfill({ status: 200, headers: { ...cors, ETag: etag }, body: "" });
    });
    await page.route("**/api/v1/diagnostics/upload-complete", async (route) => {
      order.push("confirm");
      confirmBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        json: {
          success: true,
          data: {
            uploadSessionId: id,
            s3Key: key,
            status: "UPLOADED",
            confirmedAt: new Date().toISOString(),
          },
        },
      });
    });
    await choosePhoto(page, await jpeg(page, true));
    await expect.poll(() => order.includes("put")).toBe(true);
    await expect(page.getByRole("button", { name: "사진 다시 선택" })).toBeDisabled();
    await expect(
      page
        .getByRole("navigation", { name: "주요 메뉴" })
        .getByRole("link", { name: "홈", exact: true }),
    ).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByRole("progressbar")).toBeVisible();
    finish?.();
    await expect(
      page.getByRole("status").filter({ hasText: "사진이 안전하게 등록되었습니다." }),
    ).toBeVisible();
    expect(order).toEqual(["issue", "put", "confirm"]);
    expect(confirmBody).toEqual({ uploadSessionId: id, etag });
    expect(putType).toBe("image/jpeg");
    expect(putEncryption).toBe("AES256");
    expect(putCapture.body).not.toBeNull();
    expect(issueSize).toBe(putCapture.body?.length);
    const dimensions = await page
      .getByAltText("선택한 정면 사진 미리보기")
      .evaluate((node) =>
        node instanceof HTMLImageElement
          ? { width: node.naturalWidth, height: node.naturalHeight }
          : null,
      );
    expect(dimensions).toEqual({ width: 1280, height: 1280 });
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
      window.scrollTo(0, 0);
    });
    await page.screenshot({
      path: testInfo.outputPath(`album-success-${width}.png`),
      fullPage: true,
    });
    await page.getByRole("button", { name: "앨범 사진 선택하기", exact: true }).click();
    await expect(page.getByRole("button", { name: "다음 단계로 이동" })).toBeVisible();
    await page.getByRole("button", { name: "다음 단계로 이동" }).click();
    await expect(
      page.getByRole("heading", {
        name: "세안 후 아무것도 바르지 않으면 피부는 어떤가요?",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("navigation", { name: "주요 메뉴" })
        .getByRole("link", { name: "홈", exact: true }),
    ).toHaveAttribute("aria-disabled", "false");
  });
}
test("invalid originals never reach APIs and rate limits are visible", async ({ page }) => {
  await page.goto("/diagnostic");
  let calls = 0;
  await page.route("**/api/v1/diagnostics/upload-url", async (route) => {
    calls++;
    await route.fulfill({
      status: 429,
      json: { success: false, error: { code: "RATE_LIMIT_EXCEEDED" } },
    });
  });
  for (const item of [
    { name: "bad.txt", mimeType: "text/plain", buffer: Buffer.alloc(20000) },
    { name: "tiny.jpg", mimeType: "image/jpeg", buffer: Buffer.alloc(10239) },
    { name: "huge.jpg", mimeType: "image/jpeg", buffer: Buffer.alloc(10485761) },
  ]) {
    await choosePhoto(page, item, false);
    await expect(
      page.getByRole("alert").filter({ hasText: /JPG|너무 작아|10MB를 초과/ }),
    ).toBeVisible();
  }
  expect(calls).toBe(0);
  await choosePhoto(page, await jpeg(page));
  await expect(page.getByRole("alert").filter({ hasText: "1시간 후 다시 시도" })).toBeVisible();
  expect(calls).toBe(1);
  await expect(page.getByRole("button", { name: "다시 시도", exact: true })).toBeEnabled();
});
test("interrupted PUT offers retry without inventing confirmation", async ({ page }) => {
  await page.goto("/diagnostic");
  let confirmations = 0;
  await page.route("**/api/v1/diagnostics/upload-url", (route) =>
    route.fulfill({
      status: 201,
      json: {
        success: true,
        data: {
          uploadSessionId: id,
          s3Key: key,
          uploadUrl: "https://test-vault.invalid/photo",
          expiresInSeconds: 900,
        },
      },
    }),
  );
  await page.route("https://test-vault.invalid/**", (route) => route.abort("internetdisconnected"));
  await page.route("**/api/v1/diagnostics/upload-complete", (route) => {
    confirmations++;
    return route.fulfill({ status: 500, body: "" });
  });
  await choosePhoto(page, await jpeg(page));
  await expect(
    page.getByRole("alert").filter({
      hasText: "사진 전송 중 오류가 발생했습니다. 네트워크 상태를 확인하고 다시 시도해주세요.",
    }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "다시 시도", exact: true })).toBeEnabled();
  expect(confirmations).toBe(0);
});

test("dark album photo opens the same guidance and never requests an upload", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  let requests = 0;
  await page.route("**/api/v1/diagnostics/upload-url", (route) => {
    requests++;
    return route.abort();
  });
  await page.goto("/diagnostic");
  await choosePhoto(page, await jpeg(page, false, true));
  const dialog = page.getByRole("dialog", { name: "주변이 너무 어두워요" });
  await expect(dialog).toBeVisible();
  await expect(page.getByAltText("선택한 정면 사진 미리보기")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("slider", { name: "확대/축소" })).toBeFocused();
  expect(requests).toBe(0);
});
