import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";
import { z } from "zod";
test.use({ trace: "off" });
const key = `daily-snapshots/snp-${randomUUID()}.jpg`;
const etag = '"0123456789abcdef0123456789abcdef"';
let fixturePath: string;
function fixture(action: string, payloadPath?: string): unknown {
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        "tests/fixtures/snapshot-data.ts",
        action,
        fixturePath,
        ...(payloadPath ? [payloadPath] : []),
      ],
      { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ),
  );
}
test.beforeEach(async ({ context, baseURL }) => {
  fixturePath = `/tmp/sikin-snapshot-test-${randomUUID()}.json`;
  const state = z.object({ token: z.string() }).parse(fixture("initialize"));
  await context.addCookies([
    {
      name: "app_session_token",
      value: state.token,
      url: baseURL ?? "http://127.0.0.1:3000",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
});
test.afterEach(() => {
  fixture("cleanup");
});
async function photo(page: Page) {
  const encoded = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas missing");
    const pixels = context.createImageData(640, 480);
    let n = 137;
    for (let i = 0; i < pixels.data.length; i += 4) {
      n = (n * 1664525 + 1013904223) >>> 0;
      pixels.data[i] = n & 255;
      pixels.data[i + 1] = (n >>> 8) & 255;
      pixels.data[i + 2] = (n >>> 16) & 255;
      pixels.data[i + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.9).split(",")[1];
  });
  return {
    name: "snapshot-test.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from(encoded, "base64"),
  };
}
const recordedSchema = z.object({
  id: z.string(),
  recordDate: z.string(),
  createdAt: z.string(),
  feedbackComment: z.string(),
});
async function mocks(page: Page, image: Buffer) {
  const cors = {
    "access-control-allow-origin": "http://127.0.0.1:3000",
    "access-control-allow-methods": "PUT,OPTIONS",
    "access-control-allow-headers": "content-type,x-amz-server-side-encryption",
    "access-control-expose-headers": "ETag",
  };
  await page.route("https://test-sikin-snapshots.s3.ap-northeast-2.amazonaws.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "image/jpeg", body: image }),
  );
  await page.route("https://snapshot-vault.invalid/**", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }
    expect(route.request().headers()["x-amz-server-side-encryption"]).toBe("AES256");
    await route.fulfill({ status: 200, headers: { ...cors, ETag: etag }, body: "" });
  });
  await page.route("**/api/v1/snapshots/upload-url", (route) =>
    route.fulfill({
      status: 201,
      json: {
        success: true,
        data: {
          uploadSessionId: key.split("/")[1].slice(0, -4),
          uploadUrl: "https://snapshot-vault.invalid/photo",
          s3Key: key,
          recordDate: "2026-11-15",
          expiresInSeconds: 300,
        },
      },
    }),
  );
  await page.route("**/api/v1/snapshots", async (route) => {
    const body = route.request().postDataJSON();
    expect(body.etag).toBe(etag);
    expect(body.s3Key).toBe(key);
    const payloadPath = `${fixturePath}.payload`;
    writeFileSync(payloadPath, JSON.stringify(body), { mode: 0o600 });
    const saved = recordedSchema.parse(fixture("record", payloadPath));
    unlinkSync(payloadPath);
    await route.fulfill({
      status: 201,
      json: {
        success: true,
        data: {
          ...saved,
          viewUrl: "https://test-sikin-snapshots.s3.ap-northeast-2.amazonaws.com/preview.jpg",
          feedbackSource: "GENERAL_GUIDANCE",
          conditions: null,
        },
      },
    });
  });
}
for (const width of [320, 1280])
  test(`member daily record and refresh preserve an honest guidance card at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/snapshot");
    const image = await photo(page);
    await mocks(page, image.buffer);
    await expect(
      page.getByRole("heading", { name: "오늘의 피부 스냅샷을 남겨보세요" }),
    ).toBeVisible();
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "앨범에서 선택하기" }).click();
    await (await chooser).setFiles(image);
    await expect(page.getByRole("heading", { name: "오늘의 일반 관리 안내" })).toBeVisible();
    await expect(
      page.getByText("기록 완료! 내일 다시 기록할 수 있어요.", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("AI가 연결되지 않아 보습·진정·유분 상태를 판정하지 않았습니다.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "피부 기록 캘린더" }).getByRole("status"),
    ).toContainText("이번 달 1일 기록");
    await page.reload();
    await expect(page.getByRole("heading", { name: "오늘의 일반 관리 안내" })).toBeVisible();
    await expect(page.getByRole("button", { name: "앨범에서 선택하기" })).toHaveCount(0);
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
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath(`snapshot-recorded-${width}.png`),
      fullPage: true,
    });
  });
test("camera permission failure remains recoverable and guest APIs stay protected", async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: async () => {
        throw new DOMException("Permission denied", "NotAllowedError");
      },
    });
  });
  await page.goto("/snapshot");
  await page.getByRole("button", { name: "카메라로 촬영하기" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "카메라에 접근할 수 없습니다" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "앨범에서 선택하기" })).toBeEnabled();
  await context.clearCookies();
  await page.goto("/snapshot");
  await expect(
    page.getByRole("heading", { name: "일일 피부 기록은 로그인이 필요한 서비스입니다" }),
  ).toBeVisible();
  expect((await page.request.get("/api/v1/snapshots/today")).status()).toBe(401);
  await page.getByRole("button", { name: "로그인하고 결과 보관하기" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});
test("synthetic camera capture records a snapshot and releases its video track", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 640;
        canvas.height = 480;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas unavailable");
        const pixels = context.createImageData(640, 480);
        let n = 127;
        for (let i = 0; i < pixels.data.length; i += 4) {
          n = (n * 1664525 + 1013904223) >>> 0;
          pixels.data[i] = n & 255;
          pixels.data[i + 1] = (n >>> 8) & 255;
          pixels.data[i + 2] = (n >>> 16) & 255;
          pixels.data[i + 3] = 255;
        }
        context.putImageData(pixels, 0, 0);
        return canvas.captureStream(10);
      },
    });
  });
  await page.goto("/snapshot");
  await mocks(page, (await photo(page)).buffer);
  await page.getByRole("button", { name: "카메라로 촬영하기" }).click();
  const video = page.getByLabel("전면 카메라 미리보기");
  await expect
    .poll(() =>
      video.evaluate((element) => (element instanceof HTMLVideoElement ? element.videoWidth : 0)),
    )
    .toBe(640);
  await video.evaluate((element) => {
    if (element instanceof HTMLVideoElement && element.srcObject instanceof MediaStream) {
      (window as Window & { snapshotTestTrack?: MediaStreamTrack }).snapshotTestTrack =
        element.srcObject.getVideoTracks()[0];
    }
  });
  await page.getByRole("button", { name: "사진 촬영", exact: true }).click();
  await expect(page.getByRole("heading", { name: "오늘의 일반 관리 안내" })).toBeVisible();
  await expect(video).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        (window as Window & { snapshotTestTrack?: MediaStreamTrack }).snapshotTestTrack?.readyState,
    ),
  ).toBe("ended");
});
