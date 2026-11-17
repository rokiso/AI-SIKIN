import { expect, test } from "@playwright/test";

for (const path of ["/diagnostic", "/snapshot"]) {
  test(`${path} previews locally without upload and forgets on reload`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 850 });
    const writes: string[] = [];
    page.on("request", (r) => {
      if (["POST", "PUT", "PATCH"].includes(r.method())) writes.push(r.url());
    });
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "사진 테스트 모드" })).toBeVisible();
    const image = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 500;
      canvas.height = 500;
      const ctx = canvas.getContext("2d")!;
      const data = ctx.createImageData(500, 500);
      for (let i = 0; i < data.data.length; i += 4) {
        data.data[i] = (i * 73) % 251;
        data.data[i + 1] = (i * 31) % 253;
        data.data[i + 2] = (i * 17) % 255;
        data.data[i + 3] = 255;
      }
      ctx.putImageData(data, 0, 0);
      return canvas.toDataURL("image/jpeg").split(",")[1];
    });
    await page.getByLabel("앨범에서 사진 선택", { exact: true }).setInputFiles({
      name: "test.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from(image, "base64"),
    });
    const preview = page.getByAltText("이 기기에서 선택한 사진 미리보기");
    await expect(preview).toBeVisible();
    await expect(preview).toHaveAttribute("src", /^blob:/);
    await expect(
      page.getByText("사진을 이 기기에서만 미리보고 있어요. 저장하거나 분석하지 않았습니다."),
    ).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole("button", { name: "미리보기 지우기" }).click();
    await expect(preview).toHaveCount(0);
    await page.getByLabel("휴대폰 카메라로 촬영", { exact: true }).setInputFiles({
      name: "camera.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from(image, "base64"),
    });
    await expect(preview).toBeVisible();
    await page.reload();
    await expect(preview).toHaveCount(0);
    expect(writes).toEqual([]);
  });
}

test("guided camera preview never uploads and releases tracks", async ({ page }) => {
  const { syntheticCamera, streamsStopped } = await import("./fixtures/camera-browser");
  await syntheticCamera(page);
  const writes: string[] = [];
  page.on("request", (request) => {
    if (["POST", "PUT", "PATCH"].includes(request.method())) writes.push(request.url());
  });
  await page.goto("/diagnostic");
  await page.getByRole("button", { name: "가이드 카메라로 촬영" }).click();
  await page.getByRole("button", { name: "카메라 켜기", exact: true }).click();
  await expect(page.getByRole("button", { name: "촬영", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "촬영", exact: true }).click();
  await page.getByRole("button", { name: "이 사진 미리보기", exact: true }).click();
  await expect(
    page.getByText("사진을 이 기기에서만 미리보고 있어요. 저장하거나 분석하지 않았습니다."),
  ).toBeVisible();
  expect(await streamsStopped(page)).toBe(true);
  expect(writes).toEqual([]);
});
