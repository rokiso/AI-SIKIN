import { describe, expect, it } from "vitest";
import { analyzeImageQuality } from "@/lib/image/faceQualityValidator";

function pixels(value: (i: number) => [number, number, number]) {
  const result = new Uint8ClampedArray(16 * 16 * 4);
  for (let i = 0; i < 256; i++) result.set([...value(i), 255], 4 * i);
  return result;
}
const uniform = (value: number) => pixels(() => [value, value, value]);
const centered = [{ boundingBox: { x: 4, y: 3, width: 8, height: 10 } }];

describe("local face quality", () => {
  it("prioritizes luminance below 40 over the other defects", () => {
    expect(analyzeImageQuality(uniform(39), 16, 16, [])).toMatchObject({
      averageLuminance: 39,
      failureReason: "LOW_LIGHT",
    });
    expect(analyzeImageQuality(uniform(40), 16, 16, []).isLowLight).toBe(false);
  });

  it("distinguishes a native detector miss, a displaced face and blur", () => {
    expect(analyzeImageQuality(uniform(128), 16, 16, []).failureReason).toBe("FACE_NOT_FOUND");
    expect(
      analyzeImageQuality(uniform(128), 16, 16, [
        { boundingBox: { x: 0, y: 0, width: 3, height: 3 } },
      ]).failureReason,
    ).toBe("FACE_NOT_FOUND");
    expect(analyzeImageQuality(uniform(128), 16, 16, centered)).toMatchObject({
      blurScore: 0,
      failureReason: "BLURRY",
    });
  });

  it("uses the central pixels and contrast for the fallback when detection is unavailable", () => {
    const detailed = pixels((i) =>
      (Math.floor(i / 16) + (i % 16)) % 2 ? [194, 145, 115] : [118, 85, 65],
    );
    expect(analyzeImageQuality(detailed, 16, 16)).toMatchObject({
      faceDetected: true,
      failureReason: null,
      isValidQuality: true,
    });
    expect(analyzeImageQuality(detailed, 16, 16, []).failureReason).toBe("FACE_NOT_FOUND");
    expect(analyzeImageQuality(uniform(128), 16, 16).failureReason).toBe("FACE_NOT_FOUND");
  });

  it("rejects malformed image buffers", () => {
    expect(() => analyzeImageQuality(new Uint8ClampedArray(4), 16, 16)).toThrow();
  });
});
