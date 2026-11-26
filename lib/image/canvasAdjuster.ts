import {
  decodeAlbumImage,
  validAlbumSignature,
  validateAlbumFile,
  type ProcessedImageResult,
} from "./clientPreprocess";
import { validateFaceQuality } from "./faceQualityValidator";
import { uploadFileSchema } from "@/lib/diagnostic/upload-validation";

export interface ImageAdjustmentState {
  scale: number;
  offsetX: number;
  offsetY: number;
  brightness: number;
  contrast: number;
  rotationDegree: 0 | 90 | 180 | 270;
}
export type AdjustmentSummary = {
  appliedBrightness: number;
  appliedContrast: number;
  appliedScale: number;
};
export const defaultAdjustment: ImageAdjustmentState = {
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  brightness: 0,
  contrast: 0,
  rotationDegree: 0,
};
export const adjustmentFileError =
  "10KB 이상 10MB 이하의 JPG, PNG, WebP 사진 파일만 업로드할 수 있습니다.";
export type AdjustmentImage = {
  source: HTMLCanvasElement;
  width: number;
  height: number;
  close: () => void;
};
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function constrainAdjustment(
  width: number,
  height: number,
  value: ImageAdjustmentState,
): ImageAdjustmentState {
  if (
    ![
      width,
      height,
      value.scale,
      value.offsetX,
      value.offsetY,
      value.brightness,
      value.contrast,
    ].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0
  )
    throw new RangeError("사진 보정 값을 확인할 수 없습니다.");
  const scale = clamp(value.scale, 1, 3);
  const fit = 1280 / Math.min(width, height);
  return {
    ...value,
    scale,
    offsetX: clamp(
      value.offsetX,
      -(width * fit * scale - 1280) / 2,
      (width * fit * scale - 1280) / 2,
    ),
    offsetY: clamp(
      value.offsetY,
      -(height * fit * scale - 1280) / 2,
      (height * fit * scale - 1280) / 2,
    ),
    brightness: clamp(value.brightness, -50, 50),
    contrast: clamp(value.contrast, -50, 50),
    rotationDegree: 0,
  };
}
export function adjustmentRect(
  width: number,
  height: number,
  value: ImageAdjustmentState,
  size = 1280,
) {
  const state = constrainAdjustment(width, height, value);
  const fit = (size / Math.min(width, height)) * state.scale;
  return {
    x: (size - width * fit) / 2 + (state.offsetX * size) / 1280,
    y: (size - height * fit) / 2 + (state.offsetY * size) / 1280,
    width: width * fit,
    height: height * fit,
  };
}
export function zoomAdjustment(
  width: number,
  height: number,
  value: ImageAdjustmentState,
  scale: number,
  anchorX = 0,
  anchorY = 0,
) {
  const next = clamp(scale, 1, 3),
    ratio = next / value.scale;
  return constrainAdjustment(width, height, {
    ...value,
    scale: next,
    offsetX: anchorX + (value.offsetX - anchorX) * ratio,
    offsetY: anchorY + (value.offsetY - anchorY) * ratio,
  });
}
export function adjustPixels(pixels: Uint8ClampedArray, brightness: number, contrast: number) {
  const light = 1 + clamp(brightness, -50, 50) / 100;
  const detail = 1 + clamp(contrast, -50, 50) / 100;
  for (let i = 0; i < pixels.length; i += 4)
    for (let channel = 0; channel < 3; channel++)
      pixels[i + channel] = (pixels[i + channel] * light - 127.5) * detail + 127.5;
}
export function drawAdjusted(
  canvas: HTMLCanvasElement,
  image: AdjustmentImage,
  state: ImageAdjustmentState,
  size: number,
) {
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context)
    throw new Error("이 브라우저에서 사진을 보정할 수 없습니다. 다른 사진을 선택해주세요.");
  const rect = adjustmentRect(image.width, image.height, state, size);
  context.drawImage(image.source, rect.x, rect.y, rect.width, rect.height);
  // Pixel arithmetic also works in browsers without CanvasRenderingContext2D.filter.
  if (state.brightness !== 0 || state.contrast !== 0) {
    const pixels = context.getImageData(0, 0, size, size);
    adjustPixels(pixels.data, state.brightness, state.contrast);
    context.putImageData(pixels, 0, 0);
  }
}
export async function prepareAdjustmentImage(
  file: File,
  signal: AbortSignal,
): Promise<AdjustmentImage> {
  validateAlbumFile(file);
  signal.throwIfAborted();
  if (!(await validAlbumSignature(file)))
    throw new Error("이미지를 불러올 수 없습니다. 다른 사진을 선택해주세요.");
  signal.throwIfAborted();
  const decoded = await decodeAlbumImage(file);
  const canvas = document.createElement("canvas");
  try {
    signal.throwIfAborted();
    const scale = Math.min(1, 2048 / Math.max(decoded.width, decoded.height));
    canvas.width = Math.max(1, Math.round(decoded.width * scale));
    canvas.height = Math.max(1, Math.round(decoded.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("사진을 불러올 수 없습니다.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
    signal.throwIfAborted();
    return {
      source: canvas,
      width: canvas.width,
      height: canvas.height,
      close: () => {
        canvas.width = canvas.height = 0;
      },
    };
  } catch (error) {
    canvas.width = canvas.height = 0;
    throw error;
  } finally {
    decoded.close();
  }
}
export async function exportAdjustedImage(
  image: AdjustmentImage,
  state: ImageAdjustmentState,
  signal: AbortSignal,
): Promise<ProcessedImageResult> {
  const canvas = document.createElement("canvas");
  try {
    signal.throwIfAborted();
    drawAdjusted(canvas, image, constrainAdjustment(image.width, image.height, state), 1280);
    await validateFaceQuality(canvas, 1280, 1280);
    signal.throwIfAborted();
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value
            ? resolve(value)
            : reject(new Error("사진 보정에 실패했습니다. 다시 시도해주세요.")),
        "image/jpeg",
        0.9,
      ),
    );
    signal.throwIfAborted();
    const parsed = uploadFileSchema.safeParse({ mimeType: blob.type, fileSizeBytes: blob.size });
    if (!parsed.success || blob.type !== "image/jpeg")
      throw new Error("보정한 사진의 용량이 허용 범위를 벗어났습니다. 다른 사진을 선택해주세요.");
    return {
      blob,
      ...parsed.data,
      width: 1280,
      height: 1280,
      previewUrl: URL.createObjectURL(blob),
    };
  } finally {
    canvas.width = canvas.height = 0;
  }
}
