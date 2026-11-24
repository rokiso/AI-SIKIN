export type QualityFailureReason = "FACE_NOT_FOUND" | "LOW_LIGHT" | "BLURRY";

type DetectedFace = { boundingBox: Pick<DOMRectReadOnly, "x" | "y" | "width" | "height"> };
type Detector = new (options: { fastMode: boolean; maxDetectedFaces: number }) => {
  detect(source: HTMLCanvasElement): Promise<DetectedFace[]>;
};

export interface QualityValidationDetail {
  averageLuminance: number;
  contrastScore: number;
  blurScore: number;
  faceDetected: boolean;
  faceCenterOffsetRatio: number;
  isLowLight: boolean;
  isBlurry: boolean;
  isValidQuality: boolean;
  failureReason: QualityFailureReason | null;
}

export class PhotoQualityError extends Error {
  constructor(readonly reason: QualityFailureReason) {
    super("사진 품질을 확인해 주세요.");
    this.name = "PhotoQualityError";
  }
}

export function analyzeImageQuality(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  faces?: DetectedFace[],
): QualityValidationDetail {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 3 ||
    height < 3 ||
    data.length !== width * height * 4
  )
    throw new Error("사진의 품질을 확인할 수 없습니다. 다시 촬영해주세요.");
  const luma = new Float32Array(width * height);
  let sum = 0;
  let squared = 0;
  let centerPixels = 0;
  let matchingPixels = 0;
  for (let i = 0; i < luma.length; i++) {
    const r = data[i * 4],
      g = data[i * 4 + 1],
      b = data[i * 4 + 2];
    const n = (299 * r + 587 * g + 114 * b) / 1000;
    if (
      faces === undefined &&
      (((i % width) + 0.5) / width - 0.5) ** 2 +
        ((Math.floor(i / width) + 0.5) / height - 0.5) ** 2 <=
        0.25 ** 2
    ) {
      centerPixels++;
      const cb = 128 + (b - n) * 0.564;
      const cr = 128 + (r - n) * 0.713;
      if (cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173) matchingPixels++;
    }
    luma[i] = n;
    sum += n;
    squared += n * n;
  }
  const averageLuminance = sum / luma.length;
  const contrastScore = Math.sqrt(Math.max(0, squared / luma.length - averageLuminance ** 2));
  let laplacian = 0,
    laplacianSquared = 0,
    count = 0;
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++) {
      const p = y * width + x;
      const n = 4 * luma[p] - luma[p - 1] - luma[p + 1] - luma[p - width] - luma[p + width];
      laplacian += n;
      laplacianSquared += n * n;
      count++;
    }
  const variance = Math.max(0, laplacianSquared / count - (laplacian / count) ** 2);
  const faceCenterOffsetRatio = faces
    ? Math.min(
        1,
        ...faces.map(
          ({ boundingBox: box }) =>
            Math.hypot(
              (box.x + box.width / 2) / width - 0.5,
              (box.y + box.height / 2) / height - 0.5,
            ) * 2,
        ),
      )
    : centerPixels && matchingPixels / centerPixels >= 0.15 && contrastScore >= 8
      ? 0
      : 1;
  const faceDetected = faceCenterOffsetRatio <= 0.5;
  const isLowLight = averageLuminance < 40;
  const isBlurry = variance < 50;
  const failureReason = isLowLight
    ? "LOW_LIGHT"
    : !faceDetected
      ? "FACE_NOT_FOUND"
      : isBlurry
        ? "BLURRY"
        : null;
  return {
    averageLuminance,
    contrastScore,
    isLowLight,
    isBlurry,
    isValidQuality: failureReason === null,
    failureReason,
    blurScore: variance,
    faceDetected,
    faceCenterOffsetRatio,
  };
}

export async function validateFaceQuality(
  source: CanvasImageSource,
  width: number,
  height: number,
) {
  const scale = Math.min(1, 640 / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  let timer: number | undefined;
  try {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("사진의 품질을 확인할 수 없습니다. 다른 사진을 선택해 주세요.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const FaceDetector = (globalThis as typeof globalThis & { FaceDetector?: Detector })
      .FaceDetector;
    let faces: DetectedFace[] | undefined;
    if (typeof FaceDetector === "function") {
      try {
        faces = await Promise.race([
          new FaceDetector({ fastMode: true, maxDetectedFaces: 2 }).detect(canvas),
          new Promise<undefined>((resolve) => {
            timer = window.setTimeout(resolve, 200);
          }),
        ]);
      } catch {
        // The browser may expose the API even when its detector service is unavailable.
      }
    }
    const result = analyzeImageQuality(pixels.data, canvas.width, canvas.height, faces);
    if (result.failureReason) throw new PhotoQualityError(result.failureReason);
    return result;
  } finally {
    clearTimeout(timer);
    canvas.width = canvas.height = 0;
  }
}
