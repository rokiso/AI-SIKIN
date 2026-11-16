import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCameraStream } from "../../hooks/useCameraStream";
afterEach(() => vi.restoreAllMocks());
describe("camera lifecycle", () => {
  it("stops tracks if permission resolves after unmount", async () => {
    const deferred = Promise.withResolvers<{ getTracks: () => { stop: () => void }[] }>();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn(() => deferred.promise) },
    });
    const stop = vi.fn();
    const { result, unmount } = renderHook(() => useCameraStream());
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.start();
    });
    unmount();
    await act(async () => {
      deferred.resolve({ getTracks: () => [{ stop }] });
      await pending;
    });
    expect(stop).toHaveBeenCalledOnce();
  });
  it("cancels a pending request on stop and uses user/environment facing modes", async () => {
    const stopped = vi.fn();
    const getUserMedia = vi.fn(async (constraints: MediaStreamConstraints) => {
      expect(constraints.audio).toBe(false);
      return { getTracks: () => [{ stop: stopped }] };
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
    const { result, unmount } = renderHook(() => useCameraStream());
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.status).toBe("active");
    await act(async () => {
      await result.current.start("environment");
    });
    expect(stopped).toHaveBeenCalledOnce();
    expect(getUserMedia.mock.calls[1]?.[0]).toMatchObject({
      video: { facingMode: { ideal: "environment" } },
    });
    unmount();
    expect(stopped).toHaveBeenCalledTimes(2);
  });
});
