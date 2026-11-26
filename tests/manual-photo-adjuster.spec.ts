import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { jpeg } from "./fixtures/album-browser";
import { mockFaceDetector } from "./fixtures/face-detector-browser";
import { consentedPhotoActor } from "./fixtures/consent-browser";

test.beforeEach(async ({ page }) => {
  await consentedPhotoActor(page);
  await mockFaceDetector(page);
});
for (const width of [320, 1280]) {
  test(`manual crop, pointer pan, pinch, light, reset and keyboard controls at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    let writes = 0;
    await page.route("**/api/v1/diagnostics/upload-*", (route) => {
      writes++;
      return route.abort();
    });
    await page.goto("/diagnostic");
    await page.getByLabel("앨범 사진 파일").setInputFiles(await jpeg(page));
    const canvas = page.getByLabel("보정할 사진", { exact: true });
    await expect(canvas).toBeVisible();
    const pixels = () =>
      canvas.evaluate((el) => {
        const data = (el as HTMLCanvasElement).getContext("2d")!.getImageData(0, 0, 400, 400).data;
        let hash = 2166136261;
        for (const byte of data) hash = Math.imul(hash ^ byte, 16777619);
        return hash;
      });
    const original = await pixels();
    const zoom = page.getByRole("slider", { name: "확대/축소" });
    await zoom.focus();
    await page.keyboard.press("ArrowRight");
    await expect(zoom).toHaveValue("1.05");
    await expect.poll(pixels).not.toBe(original);
    await zoom.fill("2");
    await canvas.scrollIntoViewIfNeeded();
    const beforeDrag = await pixels();
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 25, box.y + box.height / 2 + 20, { steps: 4 });
    await page.mouse.up();
    await expect.poll(pixels).not.toBe(beforeDrag);
    // Real touch pointer events exercise the same two-finger pan/zoom path.
    const cdp = await page.context().newCDPSession(page);
    await canvas.scrollIntoViewIfNeeded();
    const touchBox = (await canvas.boundingBox())!;
    const x = touchBox.x + touchBox.width / 2,
      y = touchBox.y + touchBox.height / 2;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { x: x - 20, y },
        { x: x + 20, y },
      ],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { x: x - 30, y },
        { x: x + 30, y },
      ],
    });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(async () => Number(await zoom.inputValue())).toBeGreaterThan(2);
    await cdp.detach();
    for (const label of ["밝기 조절", "대비 조절"]) {
      const before = await pixels();
      await page.getByRole("slider", { name: label }).fill("30");
      await expect.poll(pixels).not.toBe(before);
    }
    expect(writes).toBe(0);
    const editor = page.getByRole("region", { name: "사진 위치와 조명 보정" });
    for (const control of await editor.locator("button, input").all()) {
      const size = (await control.boundingBox())!;
      expect(size.width).toBeGreaterThanOrEqual(44);
      expect(size.height).toBeGreaterThanOrEqual(44);
    }
    await expect(page.getByRole("complementary", { name: "진단 전 안내" })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      window.scrollTo(0, 0);
    });
    await page.screenshot({ path: info.outputPath(`manual-adjust-${width}.png`), fullPage: true });
    await canvas.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`manual-viewport-${width}.png`) });
    await page.getByRole("button", { name: "초기화", exact: true }).click();
    await expect(zoom).toHaveValue("1");
    await expect(page.getByRole("slider", { name: "밝기 조절" })).toHaveValue("0");
    await expect(page.getByRole("slider", { name: "대비 조절" })).toHaveValue("0");
    await expect.poll(pixels).toBe(original);
    // Replacing an image unmounts and clears the old backing canvas.
    await page.getByRole("button", { name: "카메라로 촬영하기", exact: true }).click();
    await expect(canvas).toHaveCount(0);
    expect(writes).toBe(0);
  });
}

test("corrupt file recovers and upload retry reuses the corrected image then releases its URL", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.addInitScript(() => {
    const original = URL.revokeObjectURL.bind(URL);
    Object.assign(window, { photoRevoked: [] as string[] });
    URL.revokeObjectURL = (url) => {
      (window as unknown as { photoRevoked: string[] }).photoRevoked.push(url);
      original(url);
    };
  });
  await page.goto("/diagnostic");
  let issues = 0,
    puts = 0,
    confirmations = 0;
  await page.route("**/api/v1/diagnostics/upload-url", (route) => {
    issues++;
    return route.fulfill({
      status: 201,
      json: {
        success: true,
        data: {
          uploadSessionId: "12345678-1234-4234-8234-123456789012",
          s3Key: "raw-faces/12345678-1234-4234-8234-123456789012.jpeg",
          uploadUrl: "https://adjustment.invalid/photo",
          expiresInSeconds: 900,
        },
      },
    });
  });
  await page.route("https://adjustment.invalid/**", async (route) => {
    const headers = {
      "access-control-allow-origin": "http://127.0.0.1:3000",
      "access-control-allow-methods": "PUT, OPTIONS",
      "access-control-allow-headers": "content-type,x-amz-server-side-encryption",
      "access-control-expose-headers": "ETag",
    };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    puts++;
    if (puts === 1) return route.abort("internetdisconnected");
    return route.fulfill({
      status: 200,
      headers: { ...headers, ETag: '"0123456789abcdef0123456789abcdef"' },
      body: "",
    });
  });
  await page.route("**/api/v1/diagnostics/upload-complete", (route) => {
    confirmations++;
    return route.fulfill({
      json: {
        success: true,
        data: {
          uploadSessionId: "12345678-1234-4234-8234-123456789012",
          s3Key: "raw-faces/12345678-1234-4234-8234-123456789012.jpeg",
          status: "UPLOADED",
          confirmedAt: new Date().toISOString(),
        },
      },
    });
  });
  await page
    .getByLabel("앨범 사진 파일")
    .setInputFiles({ name: "broken.jpg", mimeType: "image/jpeg", buffer: Buffer.alloc(15000) });
  await expect(
    page.getByRole("alert").filter({ hasText: "이미지를 불러올 수 없습니다" }),
  ).toHaveText("이미지를 불러올 수 없습니다. 다른 사진을 선택해주세요.");
  expect(issues).toBe(0);
  await page.getByLabel("앨범 사진 파일").setInputFiles(await jpeg(page));
  await page.getByRole("slider", { name: "밝기 조절" }).fill("10");
  expect(issues).toBe(0);
  await page.getByRole("button", { name: "보정 완료 및 사진 확정", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "사진 전송을 완료하지 못했어요" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(
    "사진 전송 중 오류가 발생했습니다. 네트워크 상태를 확인하고 다시 시도해주세요.",
  );
  expect(confirmations).toBe(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath("manual-network-retry-320.png") });
  await dialog.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "사진이 안전하게 등록되었습니다." }),
  ).toBeVisible();
  expect([issues, puts, confirmations]).toEqual([2, 2, 1]);
  const url = await page.getByAltText("선택한 정면 사진 미리보기").getAttribute("src");
  await page.getByRole("button", { name: "다음 단계로 이동" }).click();
  expect(
    await page.evaluate(
      (value) => (window as unknown as { photoRevoked: string[] }).photoRevoked.includes(value!),
      url,
    ),
  ).toBe(true);
});

for (const decoder of ["bitmap", "native-image"]) {
  test(`EXIF orientation 6 is applied exactly once with ${decoder} decoding`, async ({ page }) => {
    if (decoder === "native-image")
      await page.addInitScript(() => {
        Object.defineProperty(window, "createImageBitmap", {
          configurable: true,
          value: undefined,
        });
      });
    await page.goto("/diagnostic");
    const base64 = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 2000;
      canvas.height = 1000;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "rgb(220,60,40)";
      ctx.fillRect(0, 0, 2000, 500);
      ctx.fillStyle = "rgb(40,60,220)";
      ctx.fillRect(0, 500, 2000, 500);
      return canvas.toDataURL("image/jpeg", 0.95).split(",")[1];
    });
    const bytes = Buffer.from(base64, "base64");
    const exif = Buffer.from([
      255, 225, 0, 34, 69, 120, 105, 102, 0, 0, 73, 73, 42, 0, 8, 0, 0, 0, 1, 0, 18, 1, 3, 0, 1, 0,
      0, 0, 6, 0, 0, 0, 0, 0, 0, 0,
    ]);
    const buffer = Buffer.concat([bytes.subarray(0, 2), exif, bytes.subarray(2)]);
    expect(buffer.length).toBeGreaterThan(10240);
    await page
      .getByLabel("앨범 사진 파일")
      .setInputFiles({ name: "oriented.jpg", mimeType: "image/jpeg", buffer });
    const canvas = page.getByLabel("보정할 사진", { exact: true });
    await expect(canvas).toBeVisible();
    await expect
      .poll(() =>
        canvas.evaluate((el) => {
          const ctx = (el as HTMLCanvasElement).getContext("2d")!;
          const left = ctx.getImageData(50, 200, 1, 1).data,
            right = ctx.getImageData(350, 200, 1, 1).data;
          return left[2] > left[0] + 100 && right[0] > right[2] + 100;
        }),
      )
      .toBe(true);
  });
}
