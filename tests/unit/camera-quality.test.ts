import { describe, expect, it } from "vitest";
import { analyzeImageQuality } from "../../lib/image/viewfinderCapture";
function pixels(value: (i: number) => number) {
  const result = new Uint8ClampedArray(16 * 16 * 4);
  for (let i = 0; i < 256; i++) {
    result[i * 4] = result[i * 4 + 1] = result[i * 4 + 2] = value(i);
    result[i * 4 + 3] = 255;
  }
  return result;
}
describe("camera quality advisory", () => {
  it("warns below 40 luminance, without treating darkness as a facial diagnosis", () => {
    const dark = analyzeImageQuality(
      pixels(() => 39),
      16,
      16,
    );
    expect(dark.averageLuminance).toBeCloseTo(39);
    expect(dark.isLowLight).toBe(true);
    expect(
      analyzeImageQuality(
        pixels(() => 40),
        16,
        16,
      ).isLowLight,
    ).toBe(false);
  });
  it("warns about low contrast and accepts high-detail samples", () => {
    expect(
      analyzeImageQuality(
        pixels(() => 128),
        16,
        16,
      ),
    ).toMatchObject({ isBlurry: true, isValidQuality: false });
    expect(
      analyzeImageQuality(
        pixels((i) => ((Math.floor(i / 16) + (i % 16)) % 2 ? 255 : 0)),
        16,
        16,
      ),
    ).toMatchObject({ isBlurry: false, isLowLight: false, isValidQuality: true });
  });
  it("rejects malformed image buffers", () => {
    expect(() => analyzeImageQuality(new Uint8ClampedArray(4), 16, 16)).toThrow();
  });
});
