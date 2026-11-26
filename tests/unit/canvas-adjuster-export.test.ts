// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
const quality = vi.hoisted(() => vi.fn());
vi.mock("@/lib/image/faceQualityValidator", () => ({ validateFaceQuality: quality }));
import {
  defaultAdjustment,
  exportAdjustedImage,
  prepareAdjustmentImage,
} from "@/lib/image/canvasAdjuster";

function canvasFixture(size = 15000) {
  const context = { drawImage: vi.fn(), fillRect: vi.fn(), fillStyle: "" };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
    toBlob: vi.fn((cb: BlobCallback, type: string) =>
      cb(new Blob([new Uint8Array(size)], { type })),
    ),
  };
  vi.stubGlobal("document", { createElement: () => canvas });
  return { canvas, context };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  quality.mockReset();
});
const signal = () => new AbortController().signal;
describe("bounded image preparation and exact export", () => {
  it("decodes EXIF once and bounds the editor source to 2048px, releasing original bitmap", async () => {
    const { canvas, context } = canvasFixture();
    const close = vi.fn();
    const bitmap = { width: 4000, height: 8000, close };
    const decoder = vi.fn().mockResolvedValue(bitmap);
    vi.stubGlobal("createImageBitmap", decoder);
    const bytes = new Uint8Array(12000);
    bytes.set([255, 216, 255]);
    const file = new File([bytes], "face.jpg", { type: "image/jpeg" });
    const result = await prepareAdjustmentImage(file, signal());
    expect(decoder).toHaveBeenCalledWith(file, { imageOrientation: "from-image" });
    expect(result).toMatchObject({ width: 1024, height: 2048 });
    expect(context.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 1024, 2048);
    expect(close).toHaveBeenCalledOnce();
    result.close();
    expect([canvas.width, canvas.height]).toEqual([0, 0]);
  });
  it("checks final crop quality then encodes a 1280 square JPEG at .90 and clears the canvas", async () => {
    const { canvas } = canvasFixture();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:corrected");
    const result = await exportAdjustedImage(
      { source: {} as HTMLCanvasElement, width: 2048, height: 1024, close: vi.fn() },
      defaultAdjustment,
      signal(),
    );
    expect(quality).toHaveBeenCalledWith(canvas, 1280, 1280);
    expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), "image/jpeg", 0.9);
    expect(result).toMatchObject({
      width: 1280,
      height: 1280,
      mimeType: "image/jpeg",
      fileSizeBytes: 15000,
    });
    expect([canvas.width, canvas.height]).toEqual([0, 0]);
  });
  it("rejects tiny output and quality failure without creating a preview or upload", async () => {
    const { canvas } = canvasFixture(1000);
    const objectURL = vi.spyOn(URL, "createObjectURL");
    const source = { source: {} as HTMLCanvasElement, width: 100, height: 100, close: vi.fn() };
    await expect(exportAdjustedImage(source, defaultAdjustment, signal())).rejects.toThrow("용량");
    quality.mockRejectedValueOnce(new Error("quality rejected"));
    await expect(exportAdjustedImage(source, defaultAdjustment, signal())).rejects.toThrow(
      "quality rejected",
    );
    expect(objectURL).not.toHaveBeenCalled();
    expect(canvas.toBlob).toHaveBeenCalledTimes(1);
    expect([canvas.width, canvas.height]).toEqual([0, 0]);
  });
  it("aborts export before quality checks and releases its canvas", async () => {
    const { canvas } = canvasFixture();
    const controller = new AbortController();
    controller.abort();
    await expect(
      exportAdjustedImage(
        { source: {} as HTMLCanvasElement, width: 10, height: 10, close: vi.fn() },
        defaultAdjustment,
        controller.signal,
      ),
    ).rejects.toThrow();
    expect(quality).not.toHaveBeenCalled();
    expect([canvas.width, canvas.height]).toEqual([0, 0]);
  });
});
