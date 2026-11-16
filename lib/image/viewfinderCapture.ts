import { resizedDimensions, type ProcessedImageResult } from "./clientPreprocess";
export interface ImageQualityMetrics {
  averageLuminance: number;
  isLowLight: boolean;
  contrastScore: number;
  isBlurry: boolean;
  isValidQuality: boolean;
}
export interface OnCameraCaptureCompletePayload {
  processedImage: ProcessedImageResult;
  qualityMetrics: ImageQualityMetrics;
  uploadSessionId?: string;
  s3Key?: string;
}
export function analyzeImageQuality(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): ImageQualityMetrics {
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
  for (let i = 0; i < luma.length; i++) {
    const n = (299 * data[i * 4] + 587 * data[i * 4 + 1] + 114 * data[i * 4 + 2]) / 1000;
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
  const isLowLight = averageLuminance < 40;
  const isBlurry = variance < 80 || contrastScore < 8;
  return {
    averageLuminance,
    contrastScore,
    isLowLight,
    isBlurry,
    isValidQuality: !isLowLight && !isBlurry,
  };
}
export async function captureViewfinder(
  video: HTMLVideoElement,
): Promise<{ processedImage: ProcessedImageResult; qualityMetrics: ImageQualityMetrics }> {
  if (video.readyState < 2 || !video.videoWidth || !video.videoHeight)
    throw new Error("카메라 화면이 준비되면 다시 촬영해주세요.");
  const { width, height } = resizedDimensions(video.videoWidth, video.videoHeight);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  try {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context)
      throw new Error("이 브라우저에서는 사진을 촬영할 수 없습니다. 앨범을 이용해주세요.");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    // Live video frames already follow browser orientation; unlike album files they carry no EXIF.
    context.drawImage(video, 0, 0, width, height);
    const cropWidth = Math.max(3, Math.floor(width * 0.6)),
      cropHeight = Math.max(3, Math.floor(height * 0.6));
    const pixels = context.getImageData(
      Math.floor((width - cropWidth) / 2),
      Math.floor((height - cropHeight) / 2),
      cropWidth,
      cropHeight,
    );
    const qualityMetrics = analyzeImageQuality(pixels.data, cropWidth, cropHeight);
    const blob = await new Promise<Blob>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("사진 준비 시간이 초과됐습니다. 다시 촬영해주세요.")),
        10_000,
      );
      try {
        canvas.toBlob(
          (value) => {
            clearTimeout(timer);
            if (value) resolve(value);
            else reject(new Error("사진을 만들지 못했습니다. 다시 촬영해주세요."));
          },
          "image/jpeg",
          0.85,
        );
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      }
    });
    if (!blob.size || blob.size > 10485760)
      throw new Error("사진 용량을 확인할 수 없습니다. 다시 촬영해주세요.");
    return {
      qualityMetrics,
      processedImage: {
        blob,
        mimeType: "image/jpeg",
        fileSizeBytes: blob.size,
        width,
        height,
        previewUrl: URL.createObjectURL(blob),
      },
    };
  } finally {
    canvas.width = canvas.height = 0;
  }
}
