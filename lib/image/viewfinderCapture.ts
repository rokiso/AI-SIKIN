import { resizedDimensions, type ProcessedImageResult } from "./clientPreprocess";
import { validateFaceQuality, type QualityValidationDetail } from "./faceQualityValidator";

export type ImageQualityMetrics = QualityValidationDetail;
export interface OnCameraCaptureCompletePayload {
  processedImage: ProcessedImageResult;
  qualityMetrics: ImageQualityMetrics;
  uploadSessionId?: string;
  s3Key?: string;
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
    const qualityMetrics = await validateFaceQuality(canvas, width, height);
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
