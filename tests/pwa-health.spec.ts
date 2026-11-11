import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { z } from "zod";

const manifestSchema = z.object({
  name: z.literal("AI 피부 분석 및 맞춤 관리 서비스"),
  short_name: z.literal("AI피부맞춤"),
  display: z.literal("standalone"),
  start_url: z.literal("/"),
  scope: z.literal("/"),
  icons: z.array(z.object({ src: z.string(), sizes: z.string(), type: z.literal("image/png") })),
});

test("manifest, install icons and Apple metadata form a valid mobile installation entry", async ({ page, request }) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toMatch(/application\/(manifest\+json|json)/);
  expect(response.headers()["set-cookie"]).toBeUndefined();
  const body: unknown = await response.json();
  const manifest = manifestSchema.parse(body);
  expect(manifest.icons.map((icon) => icon.sizes)).toEqual(["192x192", "512x512"]);

  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute("content", "yes");
  const viewport = await page.locator('meta[name="viewport"]').getAttribute("content");
  expect(viewport).toContain("width=device-width");
  expect(viewport).toContain("viewport-fit=cover");
  expect(viewport).not.toContain("maximum-scale=1");

  for (const icon of manifest.icons) {
    const iconResponse = await request.get(icon.src);
    expect(iconResponse.status()).toBe(200);
    expect(iconResponse.headers()["content-type"]).toMatch(/image\/png/);
    expect(iconResponse.headers()["set-cookie"]).toBeUndefined();
    const dimensions = await page.evaluate((source) => new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error("Install icon failed to decode"));
      image.src = source;
    }), icon.src);
    const expectedSize = Number(icon.sizes.split("x")[0]);
    expect(dimensions).toEqual({ width: expectedSize, height: expectedSize });
  }
});

test("the registered worker never replays private API responses when offline", async ({ page, request, context }) => {
  const workerResponse = await request.get("/sw.js");
  expect(workerResponse.status()).toBe(200);
  expect(workerResponse.headers()["content-type"]).toMatch(/(?:application|text)\/javascript/);
  expect(workerResponse.headers()["cache-control"]).toContain("no-store");
  expect(workerResponse.headers()["service-worker-allowed"]).toBe("/");
  expect(workerResponse.headers()["set-cookie"]).toBeUndefined();

  await page.goto("/");
  const registration = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return { scope: registration.scope, script: registration.active?.scriptURL };
  });
  expect(registration.scope).toBe(new URL("/", page.url()).href);
  expect(registration.script).toBe(new URL("/sw.js", page.url()).href);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  const readiness = await page.evaluate(async () => {
    const response = await fetch("/api/v1/health", { cache: "no-store" });
    return { status: response.status, cacheControl: response.headers.get("cache-control") };
  });
  expect(readiness.status).toBe(200);
  expect(readiness.cacheControl).toContain("no-store");
  expect(await page.evaluate(() => caches.keys())).toEqual([]);

  await context.setOffline(true);
  try {
    const result = await page.evaluate(async () => {
      try {
        await fetch("/api/v1/health", { cache: "no-store" });
        return "response-replayed";
      } catch (error) {
        if (error instanceof TypeError) return "network-unavailable";
        throw error;
      }
    });
    expect(result).toBe("network-unavailable");
  } finally {
    await context.setOffline(false);
  }
});

test.describe("unavailable PostgreSQL", () => {
  test.describe.configure({ mode: "serial" });
  const origin = "http://127.0.0.1:3002";
  let server: ChildProcess | undefined;
  let startupError: Error | undefined;

  test.beforeAll(async () => {
    // Never stop or replace an unrelated process listening on this test port.
    try {
      await fetch(origin, { signal: AbortSignal.timeout(500) });
      throw new Error("Port 3002 is occupied; refusing to replace its process");
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
    }

    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3002"], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: "postgresql://127.0.0.1:1/sikin_unavailable" },
      stdio: "ignore",
    });
    server.once("error", (error) => { startupError = error; });
    await expect.poll(async () => {
      if (startupError || (server && server.exitCode !== null)) return "startup-failed";
      try {
        const response = await fetch(origin);
        return response.ok ? "ready" : "pending";
      } catch (error) {
        if (error instanceof TypeError) return "pending";
        throw error;
      }
    }, { timeout: 20_000 }).toBe("ready");
  });

  test.afterAll(async () => {
    if (!server?.pid || server.exitCode !== null) return;
    const child = server;
    const exit = once(child, "exit");
    const forceStop = setTimeout(() => child.kill("SIGKILL"), 2_000);
    child.kill("SIGTERM");
    try { await exit; }
    finally { clearTimeout(forceStop); }
  });

  test("health returns a redacted 503 for a real failed connection", async ({ request }) => {
    const response = await request.get(`${origin}/api/v1/health`);
    expect(response.status()).toBe(503);
    expect(response.headers()["cache-control"]).toContain("no-store");
    const body: unknown = await response.json();
    expect(body).toEqual({
      success: false,
      error: { code: "DATABASE_UNAVAILABLE", message: "데이터베이스 연결에 실패했습니다." },
    });
    expect(JSON.stringify(body)).not.toContain("127.0.0.1");
    expect(JSON.stringify(body)).not.toContain("sikin_unavailable");
  });

  for (const width of [320, 1280]) {
    test(`initialization failure offers visible reload recovery at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(origin);
      const alert = page.getByRole("alert").filter({ hasText: "서비스 초기화 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요." });
      await expect(alert).toBeVisible();
      const reload = alert.getByRole("button", { name: "새로고침", exact: true });
      const bounds = await reload.boundingBox();
      expect(bounds?.height).toBeGreaterThanOrEqual(44);
      expect(bounds?.width).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      expect(accessibility.violations).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`database-unavailable-${width}.png`), fullPage: true });
      await Promise.all([page.waitForNavigation(), reload.click()]);
      await expect(alert).toBeVisible();
    });
  }
});
