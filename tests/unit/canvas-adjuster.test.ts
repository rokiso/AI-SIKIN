import { describe, expect, it } from "vitest";
import {
  adjustPixels,
  adjustmentRect,
  constrainAdjustment,
  defaultAdjustment,
  zoomAdjustment,
} from "@/lib/image/canvasAdjuster";

describe("manual photo framing", () => {
  it.each([
    [2048, 1024],
    [1024, 2048],
    [1280, 1280],
  ])("covers the square without blank edges for %s×%s at every zoom limit", (width, height) => {
    for (const scale of [1, 2, 3, 99])
      for (const offset of [-1e6, 0, 1e6]) {
        const state = constrainAdjustment(width, height, {
          ...defaultAdjustment,
          scale,
          offsetX: offset,
          offsetY: offset,
        });
        const rect = adjustmentRect(width, height, state);
        expect(rect.x).toBeLessThanOrEqual(0);
        expect(rect.y).toBeLessThanOrEqual(0);
        expect(rect.x + rect.width).toBeGreaterThanOrEqual(1280);
        expect(rect.y + rect.height).toBeGreaterThanOrEqual(1280);
      }
  });
  it("keeps the selected zoom anchor stationary", () => {
    const state = zoomAdjustment(2000, 1000, defaultAdjustment, 2, 100, -100);
    expect(state).toMatchObject({ scale: 2, offsetX: -100, offsetY: 100 });
    expect(zoomAdjustment(2000, 1000, state, 1, 100, -100)).toEqual(defaultAdjustment);
  });
  it("rejects corrupt geometry and clamps user controls", () => {
    expect(() => constrainAdjustment(0, 10, defaultAdjustment)).toThrow(RangeError);
    expect(() => constrainAdjustment(10, 10, { ...defaultAdjustment, scale: NaN })).toThrow(
      RangeError,
    );
    expect(
      constrainAdjustment(10, 10, {
        ...defaultAdjustment,
        scale: 9,
        brightness: 60,
        contrast: -70,
      }),
    ).toMatchObject({ scale: 3, brightness: 50, contrast: -50 });
  });
});
describe("portable canvas light correction", () => {
  it("leaves default pixels and alpha intact", () => {
    const pixels = new Uint8ClampedArray([0, 128, 255, 90]);
    adjustPixels(pixels, 0, 0);
    expect([...pixels]).toEqual([0, 128, 255, 90]);
  });
  it("applies brightness and contrast with safe RGB clipping", () => {
    const pixels = new Uint8ClampedArray([0, 100, 255, 90]);
    adjustPixels(pixels, 50, 50);
    expect([...pixels]).toEqual([0, 161, 255, 90]);
  });
});
