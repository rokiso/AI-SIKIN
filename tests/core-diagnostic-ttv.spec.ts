import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { baumannQuestions } from "../lib/diagnostic/baumannData";
import { reportSchema } from "../lib/diagnostic/report-types";
const statePath = `/tmp/sikin-core-${randomUUID()}.json`;
function fixture(action: string, input: Record<string, string> = {}) {
  const result = execFileSync(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      "tests/fixtures/core-journey-data.ts",
      action,
      statePath,
      JSON.stringify(input),
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 15000 },
  );
  return result.trim() ? JSON.parse(result) : null;
}
async function measureInteraction(page: Page, label: string, selector: string, count: number) {
  return page.evaluate(
    ({ label, selector, count }) =>
      new Promise<number>((resolve, reject) => {
        const started = performance.now();
        const observer = new MutationObserver(() => {
          if (document.querySelectorAll(selector).length === count) {
            clearTimeout(timer);
            observer.disconnect();
            requestAnimationFrame(() =>
              requestAnimationFrame(() => resolve(performance.now() - started)),
            );
          }
        });
        const timer = setTimeout(() => {
          observer.disconnect();
          reject(new Error("Filter did not update within one second"));
        }, 1000);
        observer.observe(document.querySelector("main")!, { childList: true, subtree: true });
        if (label === "SEARCH") {
          const input = document.querySelector<HTMLInputElement>(
            'input[aria-label="상품·브랜드·성분 검색"]',
          )!;
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
            input,
            "core-no-matching-product",
          );
          input.dispatchEvent(new Event("input", { bubbles: true }));
        } else {
          const button = [...document.querySelectorAll<HTMLButtonElement>("main button")].find(
            (b) => b.textContent?.trim() === label,
          );
          if (!button) {
            clearTimeout(timer);
            observer.disconnect();
            reject(new Error("Filter control missing"));
            return;
          }
          button.click();
        }
      }),
    { label, selector, count },
  );
}
test.describe.configure({ mode: "serial" });
test.beforeAll(() => {
  fixture("initialize");
});
test.afterAll(() => {
  if (existsSync(statePath)) fixture("cleanup");
});
for (const width of [320, 375, 1280])
  test(`real local diagnostic and OAuth journey, strict gates at ${width}px`, async ({
    page,
    context,
    baseURL,
    browser,
  }, info) => {
    test.setTimeout(180000);
    const base = baseURL!;
    await page.setViewportSize({ width, height: 900 });
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 40,
      downloadThroughput: 9000000 / 8,
      uploadThroughput: 1500000 / 8,
      connectionType: "cellular4g",
    });
    const blocked: string[] = [];
    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin === base) return route.continue();
      if (url.hostname === "core-vault.invalid" && request.method() === "PUT") {
        const stored = await page.request.post("http://127.0.0.1:3101/object", {
          headers: { "x-object-path": url.pathname },
          data: request.postDataBuffer()!,
        });
        expect(stored.status()).toBe(200);
        const { etag } = await stored.json();
        return route.fulfill({
          status: 200,
          headers: {
            ETag: etag,
            "Access-Control-Allow-Origin": base,
            "Access-Control-Expose-Headers": "ETag",
          },
        });
      }
      if (url.hostname === "core-vault.invalid" && request.method() === "OPTIONS")
        return route.fulfill({
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": base,
            "Access-Control-Allow-Methods": "PUT",
            "Access-Control-Allow-Headers": "content-type,x-amz-server-side-encryption",
          },
        });
      if (url.hostname === "accounts.google.com") {
        expect(url.searchParams.get("code_challenge_method")).toBe("S256");
        expect(url.searchParams.get("redirect_uri")).toBe(
          "https://core-app.invalid/auth/callback/google",
        );
        const response = await page.request.post("http://127.0.0.1:3101/oauth", {
          data: { challenge: url.searchParams.get("code_challenge") },
        });
        const { code } = await response.json();
        // Only the external provider's browser redirect is mapped back to loopback.
        // The server still checks its genuine encrypted state cookie and PKCE verifier.
        const callback = new URL("/auth/callback/google", base);
        callback.search = new URLSearchParams({
          code,
          state: url.searchParams.get("state")!,
        }).toString();
        return route.fulfill({ status: 302, headers: { location: callback.href } });
      }
      blocked.push(url.hostname);
      return route.abort("blockedbyclient");
    });
    const start = Date.now();
    await page.goto("/");
    await expect
      .poll(() =>
        page.evaluate(() => performance.getEntriesByName("first-contentful-paint").length),
      )
      .toBeGreaterThan(0);
    const fcp = await page.evaluate(
      () => performance.getEntriesByName("first-contentful-paint")[0].startTime,
    );
    await page.goto("/diagnostic");
    const guest = (await context.cookies()).find((c) => c.name === "x-guest-session-id");
    expect(guest?.httpOnly).toBe(true);
    fixture("track", { guestId: guest!.value });
    const image = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 1280;
      const ctx = canvas.getContext("2d")!;
      const pixels = ctx.createImageData(1280, 1280);
      let n = 7;
      for (let i = 0; i < pixels.data.length; i += 4) {
        n = (n * 1664525 + 1013904223) >>> 0;
        pixels.data[i] = n & 255;
        pixels.data[i + 1] = (n >>> 8) & 255;
        pixels.data[i + 2] = (n >>> 16) & 255;
        pixels.data[i + 3] = 255;
      }
      ctx.putImageData(pixels, 0, 0);
      return canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
    });
    const uploadResponse = page.waitForResponse("**/api/v1/diagnostics/upload-complete");
    await page.getByLabel("앨범 사진 파일").setInputFiles({
      name: "synthetic-no-person.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from(image, "base64"),
    });
    await page.getByRole("dialog").getByRole("checkbox").check();
    await page.getByRole("button", { name: "동의하고 계속하기" }).click();
    const completedUpload = await uploadResponse;
    expect(completedUpload.status(), JSON.stringify((await completedUpload.json()).error)).toBe(
      200,
    );
    await page.getByRole("button", { name: "다음 단계로 이동" }).click();
    for (let i = 0; i < 12; i++) {
      await expect(page.getByRole("progressbar")).toHaveAttribute("value", String(i + 1));
      await page
        .getByRole("radio")
        .nth(baumannQuestions[i].axis === "pigmentation" ? 0 : 3)
        .check();
    }
    const saved = page.waitForResponse("**/api/v1/diagnostics/survey-answers");
    await page.getByRole("button", { name: "문진 완료하기" }).click();
    const sessionId = (await (await saved).json()).data.sessionId;
    fixture("track", { sessionId });
    const analyzed = page.waitForResponse("**/api/v1/diagnostics/analyze");
    const aiStart = Date.now();
    await page.getByRole("button", { name: "피부 리포트 보기" }).click();
    expect((await analyzed).status()).toBe(200);
    const aiMs = Date.now() - aiStart;
    const report = reportSchema.parse((await (await analyzed).json()).data);
    expect(report.source).toBe("AI_ASSISTED");
    expect(report.baumannType).toBe("OSNW");
    await expect(page.getByRole("img", { name: /레이더 차트/ })).toBeVisible();
    await expect(
      page.getByRole("region", { name: "이 리포트의 화장품 성분 확인" }).locator("article"),
    ).toHaveCount(8);
    const ttvMs = Date.now() - start;
    await expect(page.getByRole("complementary", { name: "진단 전 안내" })).toBeVisible();
    await expect(page.getByRole("link", { name: "맞춤 화장품 추천 보러가기" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const stranger = await browser.newContext();
    try {
      const otherPage = await stranger.newPage();
      await otherPage.goto(`${base}/diagnostic`);
      const otherGuest = (await stranger.cookies()).find((c) => c.name === "x-guest-session-id")!;
      fixture("track", { guestId: otherGuest.value });
      expect(
        (
          await stranger.request.get(`${base}/api/v1/diagnostics/reports/${report.reportId}`)
        ).status(),
      ).toBe(403);
    } finally {
      await stranger.close();
    }
    fixture("capture", { sessionId });
    await page.screenshot({ path: info.outputPath(`core-report-${width}.png`) });
    await page.getByRole("button", { name: "로그인하고 결과 보관하기" }).click();
    const callbackResponse = page.waitForResponse("**/api/v1/auth/callback/google");
    await page.getByRole("button", { name: "Google로 로그인" }).click();
    const callback = await callbackResponse;
    expect(callback.status()).toBe(200);
    await expect(page.getByRole("link", { name: "보관함에서 확인하기" })).toBeVisible();
    expect(fixture("verify", { sessionId })).toMatchObject({
      ownerMatched: true,
      reportPreserved: true,
      otherGuestUntouched: true,
    });
    expect((await context.cookies()).some((c) => c.name === "x-guest-session-id")).toBe(false);
    await page.goto("/mypage");
    await expect(
      page.getByRole("button").filter({ hasText: "리포트 상세 보기" }).first(),
    ).toBeVisible();
    await page.screenshot({ path: info.outputPath(`core-member-${width}.png`) });
    await page.goto(`/catalog/products?reportId=${report.reportId}`);
    await expect(page.locator("main article")).toHaveCount(8);
    const productFilterMs = await measureInteraction(page, "토너", "main article", 2);
    const productSearchMs = await measureInteraction(page, "SEARCH", "main article", 0);
    await page.goto("/catalog/procedures");
    await expect(page.getByRole("complementary", { name: "진단 전 안내" })).toBeVisible();
    await expect(page.locator('main button[aria-label$=" 상세 보기"]')).toHaveCount(10);
    const procedureFilterMs = await measureInteraction(
      page,
      "탄력·리프팅",
      'main button[aria-label$=" 상세 보기"]',
      3,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const providers = await (await page.request.get("http://127.0.0.1:3101/metrics")).json();
    expect(providers.ai).toBeGreaterThan(0);
    expect(providers.pkce).toBeGreaterThan(0);
    expect(providers.heads).toBeGreaterThanOrEqual(providers.uploads * 2);
    const metrics = {
      width,
      fcpMs: fcp,
      aiMs,
      ttvMs,
      productFilterMs,
      productSearchMs,
      procedureFilterMs,
      network: { latencyMs: 40, downloadMbps: 9, uploadMbps: 1.5 },
    };
    await info.attach("performance.json", {
      body: JSON.stringify(metrics, null, 2),
      contentType: "application/json",
    });
    console.info("CORE_METRICS", JSON.stringify(metrics));
    expect(blocked).toEqual([]);
    for (const ms of [productFilterMs, productSearchMs, procedureFilterMs])
      expect(ms).toBeLessThanOrEqual(300);
    expect(fcp).toBeLessThanOrEqual(1000);
    expect(aiMs).toBeLessThanOrEqual(10000);
    expect(ttvMs).toBeLessThanOrEqual(180000);
  });

test("forged OAuth state cannot provision a member or migrate a guest", async ({
  page,
  context,
  baseURL,
}) => {
  await page.goto("/diagnostic");
  fixture("track", {
    guestId: (await context.cookies()).find((c) => c.name === "x-guest-session-id")!.value,
  });
  const authorized = await page.request.get("/api/v1/auth/authorize/google?redirect_url=/mypage");
  expect(authorized.status()).toBe(200);
  const provider = new URL((await authorized.json()).data.authorizationUrl);
  const before = await (await page.request.get("http://127.0.0.1:3101/metrics")).json();
  const response = await page.request.post("/api/v1/auth/callback/google", {
    headers: { origin: baseURL! },
    data: { code: randomUUID(), state: randomUUID() },
  });
  expect(response.status()).toBe(400);
  const replay = await page.request.post("/api/v1/auth/callback/google", {
    headers: { origin: baseURL! },
    data: { code: randomUUID(), state: provider.searchParams.get("state") },
  });
  expect(replay.status()).toBe(400);
  expect((await (await page.request.get("/api/v1/auth/me")).json()).data.isAuthenticated).toBe(
    false,
  );
  expect((await (await page.request.get("http://127.0.0.1:3101/metrics")).json()).pkce).toBe(
    before.pkce,
  );
});
