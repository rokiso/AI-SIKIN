import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
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
async function choosePhoto(page: Page, file: { name: string; mimeType: string; buffer: Buffer }) {
  const picker = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /앨범에서 사진 선택|사진 다시 선택/ }).click();
  await (await picker).setFiles(file);
}
async function jpeg(page: Page, orientation = false) {
  const encoded = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 2000;
    canvas.height = 1000;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Missing canvas");
    const pixels = ctx.createImageData(canvas.width, canvas.height);
    let seed = 123456;
    for (let i = 0; i < pixels.data.length; i += 4) {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      pixels.data[i] = seed & 255;
      pixels.data[i + 1] = (seed >>> 8) & 255;
      pixels.data[i + 2] = (seed >>> 16) & 255;
      pixels.data[i + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.9).split(",")[1];
  });
  let buffer = Buffer.from(encoded, "base64");
  if (orientation) {
    // TIFF Orientation 6: stored 2000×1000 becomes displayed 1000×2000.
    const exif = Buffer.from([
      0xff, 0xe1, 0, 34, 0x45, 0x78, 0x69, 0x66, 0, 0, 0x49, 0x49, 42, 0, 8, 0, 0, 0, 1, 0, 0x12, 1,
      3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0,
    ]);
    buffer = Buffer.concat([buffer.subarray(0, 2), exif, buffer.subarray(2)]);
  }
  return { name: "synthetic-test.jpg", mimeType: "image/jpeg", buffer };
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
    expect(dimensions).toEqual({ width: 640, height: 1280 });
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
    await page.getByRole("button", { name: "다음 단계로 이동" }).click();
    await expect(page.getByRole("heading", { name: "문진 안내", exact: true })).toBeVisible();
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
    await choosePhoto(page, item);
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
    page.getByRole("alert").filter({ hasText: "사진 전송 중 네트워크 연결이 끊어졌습니다." }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "다시 시도", exact: true })).toBeEnabled();
  expect(confirmations).toBe(0);
});
