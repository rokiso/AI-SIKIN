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
});
describe("bounded affiliate health requests without external network", () => {
  it("falls back from unsupported HEAD to bounded GET", async () => {
    vi.stubEnv("CATALOG_AFFILIATE_HOSTS", "shop.example.com");
    mock.replies.push({ status: 405 }, { status: 200 });
    expect(await probeAffiliateLink("https://shop.example.com/item")).toBe(true);
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
    expect(await probeAffiliateLink("https://shop.example.com/item")).toBe(false);
    expect(mock.methods).toEqual(["HEAD"]);
  });
  it("aborts a stalled probe within the three second deadline", async () => {
    vi.stubEnv("CATALOG_AFFILIATE_HOSTS", "shop.example.com");
    const start = performance.now();
    expect(await probeAffiliateLink("https://shop.example.com/stall")).toBe(false);
    expect(performance.now() - start).toBeLessThan(3500);
  });
});
