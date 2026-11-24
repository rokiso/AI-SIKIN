// @vitest-environment node
import { EventEmitter } from "node:events";
import type { LookupFunction } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  replies: [] as { status: number; location?: string }[],
  methods: [] as string[],
  address: "8.8.8.8",
  lookup: null as LookupFunction | null,
}));
vi.mock("server-only", () => ({}));
vi.mock("node:dns", () => ({
  lookup: (
    _host: string,
    _options: unknown,
    callback: (error: null, addresses: { address: string; family: number }[]) => void,
  ) => callback(null, [{ address: mock.address, family: 4 }]),
}));
vi.mock("node:https", () => ({
  request: (
    _url: URL,
    options: { method: string; signal: AbortSignal; lookup: LookupFunction },
    callback: (response: {
      statusCode: number;
      headers: { location?: string };
      destroy: () => void;
    }) => void,
  ) => {
    const req = new EventEmitter();
    mock.methods.push(options.method);
    mock.lookup = options.lookup;
    const abort = () => req.emit("error", new Error("timeout"));
    options.signal.addEventListener("abort", abort, { once: true });
    return Object.assign(req, {
      end() {
        const reply = mock.replies.shift();
        if (reply)
          queueMicrotask(() => {
            options.signal.removeEventListener("abort", abort);
            callback({
              statusCode: reply.status,
              headers: { location: reply.location },
              destroy() {},
            });
          });
      },
    });
  },
}));
import { probeAffiliateLink } from "../../lib/catalog/linkHealthChecker";
afterEach(() => {
  mock.replies.length = mock.methods.length = 0;
  mock.address = "8.8.8.8";
  mock.lookup = null;
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
describe("bounded affiliate health requests without external network", () => {
  it("falls back from unsupported HEAD to bounded GET", async () => {
    vi.stubEnv("CATALOG_AFFILIATE_HOSTS", "shop.example.com");
    mock.replies.push({ status: 405 }, { status: 200 });
    expect(await probeAffiliateLink("https://shop.example.com/item")).toMatchObject({
      status: "HEALTHY",
      httpStatusCode: 200,
    });
    expect(mock.methods).toEqual(["HEAD", "GET"]);
    expect(mock.lookup).not.toBeNull();
    mock.address = "127.0.0.1";
    const lookup = mock.lookup!;
    await new Promise<void>((resolve) =>
      lookup("shop.example.com", {}, (error) => {
        expect(error).toBeInstanceOf(Error);
        resolve();
      }),
    );
  });
  it("never follows an unapproved redirect", async () => {
    vi.stubEnv("CATALOG_AFFILIATE_HOSTS", "shop.example.com");
    mock.replies.push({ status: 302, location: "http://169.254.169.254/metadata" });
    expect(await probeAffiliateLink("https://shop.example.com/item")).toMatchObject({
      status: "UNHEALTHY",
      httpStatusCode: 302,
    });
    expect(mock.methods).toEqual(["HEAD"]);
  });
  it.each([404, 500])("reports HTTP %i as unhealthy", async (status) => {
    vi.stubEnv("CATALOG_AFFILIATE_HOSTS", "shop.example.com");
    mock.replies.push({ status });
    expect(await probeAffiliateLink("https://shop.example.com/item")).toMatchObject({
      status: "UNHEALTHY",
      httpStatusCode: status,
      errorMessage: "HTTP_FAILURE",
    });
  });
  it("keeps a denied HEAD/GET separate from a dead link and detects redirect loops", async () => {
    vi.stubEnv("CATALOG_AFFILIATE_HOSTS", "shop.example.com");
    mock.replies.push({ status: 403 }, { status: 403 });
    expect(await probeAffiliateLink("https://shop.example.com/item")).toMatchObject({
      status: "UNHEALTHY",
      errorMessage: "ACCESS_DENIED",
    });
    mock.replies.push({ status: 302, location: "/item" });
    expect(await probeAffiliateLink("https://shop.example.com/item")).toMatchObject({
      status: "REDIRECT_LOOP",
    });
  });
  it("aborts the full probe at five seconds", async () => {
    vi.stubEnv("CATALOG_AFFILIATE_HOSTS", "shop.example.com");
    vi.useFakeTimers();
    const pending = probeAffiliateLink("https://shop.example.com/stall");
    await vi.advanceTimersByTimeAsync(5000);
    expect(await pending).toMatchObject({ status: "TIMEOUT", httpStatusCode: null });
  });
});
