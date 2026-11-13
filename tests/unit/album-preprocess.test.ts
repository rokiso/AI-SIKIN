// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  preprocessAlbumImage,
  resizedDimensions,
  validateAlbumFile,
} from "@/lib/image/clientPreprocess";
function file(size = 10240, type = "image/jpeg", name = "face.jpg") {
  const data = new Uint8Array(size);
  data.set([255, 216, 255]);
  return new File([data], name, { type });
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("album image validation and preprocessing", () => {
  it.each([
    [10239, false],
    [10240, true],
    [10485760, true],
    [10485761, false],
  ])("validates original size %s", (size, valid) => {
    if (valid) expect(() => validateAlbumFile(file(size))).not.toThrow();
    else expect(() => validateAlbumFile(file(size))).toThrow();
  });
  it.each([
    ["image/gif", "face.gif"],
    ["image/heic", "face.heic"],
    ["image/jpeg", "face.txt"],
    ["application/pdf", "face.pdf"],
  ])("rejects %s %s", (type, name) =>
    expect(() => validateAlbumFile(file(10240, type, name))).toThrow("JPG, PNG, WebP"),
  );
  it("fits either axis without upscaling or distortion", () => {
    expect(resizedDimensions(2000, 1000)).toEqual({ width: 1280, height: 640 });
    expect(resizedDimensions(1000, 2000)).toEqual({ width: 640, height: 1280 });
    expect(resizedDimensions(400, 300)).toEqual({ width: 400, height: 300 });
    expect(() => resizedDimensions(0, 10)).toThrow();
  });
  it("uses orientation-aware decoding, strips metadata with a quality .85 canvas and releases bitmap memory", async () => {
    const close = vi.fn();
    const drawImage = vi.fn();
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ fillStyle: "", fillRect: vi.fn(), drawImage }),
      toBlob: vi.fn((callback: BlobCallback, type: string) =>
        callback(new Blob([new Uint8Array(15000)], { type })),
      ),
    };
    vi.stubGlobal("document", { createElement: () => canvas });
    const bitmap = vi.fn().mockResolvedValue({ width: 2000, height: 1000, close });
    vi.stubGlobal("createImageBitmap", bitmap);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test-preview");
    const result = await preprocessAlbumImage(file());
    expect(result).toMatchObject({
      width: 1280,
      height: 640,
      mimeType: "image/jpeg",
      fileSizeBytes: 15000,
      previewUrl: "blob:test-preview",
    });
    expect(bitmap).toHaveBeenCalledWith(expect.any(File), { imageOrientation: "from-image" });
    expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), "image/jpeg", 0.85);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1280, 640);
    expect(close).toHaveBeenCalledOnce();
    expect(canvas.width).toBe(0);
  });
  it("blocks a forged image signature before decoding and respects cancellation", async () => {
    const bitmap = vi.fn();
    vi.stubGlobal("createImageBitmap", bitmap);
    await expect(
      preprocessAlbumImage(new File([new Uint8Array(10240)], "fake.jpg", { type: "image/jpeg" })),
    ).rejects.toThrow("정상적인");
    const controller = new AbortController();
    controller.abort();
    await expect(preprocessAlbumImage(file(), controller.signal)).rejects.toThrow();
    expect(bitmap).not.toHaveBeenCalled();
  });
});
