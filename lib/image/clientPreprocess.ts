import { uploadFileSchema } from "@/lib/diagnostic/upload-validation";
export interface ProcessedImageResult {
  blob: Blob;
  mimeType: "image/jpeg" | "image/webp" | "image/png";
  fileSizeBytes: number;
  previewUrl: string;
  width: number;
  height: number;
}
export function validateAlbumFile(file: File) {
  if (
    !/\.(jpe?g|png|webp)$/i.test(file.name) ||
    !["image/jpeg", "image/png", "image/webp"].includes(file.type)
  )
    throw new Error("JPG, PNG, WebP 형식의 이미지 파일만 업로드할 수 있습니다.");
  if (file.size < 10240)
    throw new Error("사진 파일이 너무 작아 분석할 수 없습니다. 정상적인 얼굴 사진을 선택해주세요.");
  if (file.size > 10485760)
    throw new Error("사진 용량이 10MB를 초과합니다. 10MB 이하의 사진을 선택해주세요.");
}
export function resizedDimensions(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
    throw new Error("사진을 읽을 수 없습니다. 다른 사진을 선택해주세요.");
  const scale = Math.min(1, 1280 / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
function ensureActive(signal?: AbortSignal) {
  signal?.throwIfAborted();
}
async function decode(
  file: File,
): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    // Browser decoders apply all EXIF orientations, including mirrored images.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    };
  }
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => {
        image.src = "";
        URL.revokeObjectURL(url);
      },
    };
  } catch {
    URL.revokeObjectURL(url);
    throw new Error("사진을 읽을 수 없습니다. JPG 또는 PNG 사진을 다시 선택해주세요.");
  }
}
async function validSignature(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  return file.type === "image/jpeg"
    ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : file.type === "image/png"
      ? [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n)
      : String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
        String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
}
function encode(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("사진 최적화에 실패했습니다. 다른 사진을 선택해주세요.")),
      type,
      0.85,
    ),
  );
}
export async function preprocessAlbumImage(
  file: File,
  signal?: AbortSignal,
): Promise<ProcessedImageResult> {
  validateAlbumFile(file);
  ensureActive(signal);
  if (!(await validSignature(file)))
    throw new Error(
      "사진 파일을 읽을 수 없습니다. 정상적인 JPG, PNG 또는 WebP 사진을 선택해주세요.",
    );
  ensureActive(signal);
  let decoded: Awaited<ReturnType<typeof decode>>;
  try {
    decoded = await decode(file);
  } catch {
    throw new Error("사진을 읽을 수 없습니다. JPG 또는 PNG 사진을 다시 선택해주세요.");
  }
  const canvas = document.createElement("canvas");
  try {
    ensureActive(signal);
    const { width, height } = resizedDimensions(decoded.width, decoded.height);
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error(
        "이 브라우저에서 사진을 최적화할 수 없습니다. 다른 브라우저에서 다시 시도해주세요.",
      );
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(decoded.source, 0, 0, width, height);
    let blob = await encode(canvas, "image/jpeg");
    // Do not pad tiny JPEGs to evade the API limit; a lossless encoding may retain enough image detail.
    if (blob.size < 10240) blob = await encode(canvas, "image/png");
    const parsed = uploadFileSchema.safeParse({ mimeType: blob.type, fileSizeBytes: blob.size });
    if (!parsed.success)
      throw new Error(
        "최적화된 사진의 용량이 허용 범위를 벗어났습니다. 더 선명한 다른 사진을 선택해주세요.",
      );
    ensureActive(signal);
    return { blob, ...parsed.data, width, height, previewUrl: URL.createObjectURL(blob) };
  } finally {
    decoded.close();
    canvas.width = 0;
    canvas.height = 0;
  }
}
