import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import manifest from "@/app/manifest";
import { ServiceWorkerRegistration } from "@/components/pwa/ServiceWorkerRegistration";

afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("PWA manifest", () => {
  it("defines a Korean standalone application with in-scope icons and navigation", () => {
    expect(manifest()).toMatchObject({
      name: "AI 피부 분석 및 맞춤 관리 서비스",
      short_name: "AI피부맞춤",
      display: "standalone",
      scope: "/",
      start_url: "/",
      icons: [
        { src: "/icons/sikin-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icons/sikin-512.png", sizes: "512x512", type: "image/png" },
      ],
    });
  });
});

describe("service worker registration", () => {
  const register = vi.fn();

  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubGlobal("isSecureContext", true);
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { register } });
    register.mockReset();
  });

  afterEach(() => { Reflect.deleteProperty(navigator, "serviceWorker"); });

  it("registers the same-origin worker without caching its script", async () => {
    register.mockResolvedValue({});
    render(<ServiceWorkerRegistration />);
    await waitFor(() => expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/", updateViaCache: "none" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows a safe failure and lets the user retry without duplicate submissions", async () => {
    register.mockRejectedValueOnce(new Error("private provider details")).mockResolvedValueOnce({});
    render(<ServiceWorkerRegistration />);
    await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).not.toContain("private provider details");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(screen.getByRole("status").textContent).toContain("다시 준비하고 있어요");
    expect(screen.queryByRole("button")).toBeNull();
    await waitFor(() => expect(register).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does not register in development or an insecure context", () => {
    vi.stubEnv("NODE_ENV", "development");
    const mounted = render(<ServiceWorkerRegistration />);
    expect(register).not.toHaveBeenCalled();
    mounted.unmount();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubGlobal("isSecureContext", false);
    render(<ServiceWorkerRegistration />);
    expect(register).not.toHaveBeenCalled();
  });
});
