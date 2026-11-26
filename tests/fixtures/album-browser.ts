import type { Page } from "@playwright/test";
export async function jpeg(page: Page, orientation = false, dark = false) {
  const encoded = await page.evaluate((lowLight) => {
    const canvas = document.createElement("canvas");
    canvas.width = 2000;
    canvas.height = 1000;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Missing canvas");
    const pixels = ctx.createImageData(canvas.width, canvas.height);
    let seed = 123456;
    for (let i = 0; i < pixels.data.length; i += 4) {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      pixels.data[i] = seed & (lowLight ? 63 : 255);
      pixels.data[i + 1] = (seed >>> 8) & (lowLight ? 63 : 255);
      pixels.data[i + 2] = (seed >>> 16) & (lowLight ? 63 : 255);
      pixels.data[i + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.9).split(",")[1];
  }, dark);
  let buffer = Buffer.from(encoded, "base64");
  if (orientation) {
    // TIFF Orientation 6: stored 2000×1000 becomes displayed 1000×2000.
    const exif = Buffer.from([
      0xff, 0xe1, 0, 34, 0x45, 0x78, 0x69, 0x66, 0, 0, 0x49, 0x49, 42, 0, 8, 0, 0, 0, 1, 0, 0x12, 1,
      3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0,
    ]);
    buffer = Buffer.concat([buffer.subarray(0, 2), exif, buffer.subarray(2)]);
  }
  return { name: "synthetic-test.jpg", mimeType: "image/jpeg", buffer };
}
