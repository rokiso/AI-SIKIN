import { mockFaceDetector } from "./face-detector-browser";
import type { Page } from "@playwright/test";
declare global {
  interface Window {
    cameraStreams?: MediaStream[];
    cameraRevoked?: string[];
    cameraFacings?: string[];
  }
}
export async function syntheticCamera(page: Page, dark = false, defect?: "no-face" | "blur") {
  await mockFaceDetector(page, defect !== "no-face");
  await page.addInitScript(
    ({ dark, defect }) => {
      const cameraStreams: MediaStream[] = [],
        cameraRevoked: string[] = [],
        cameraFacings: string[] = [];
      window.cameraStreams = cameraStreams;
      window.cameraRevoked = cameraRevoked;
      window.cameraFacings = cameraFacings;
      const revoke = URL.revokeObjectURL.bind(URL);
      URL.revokeObjectURL = (url) => {
        cameraRevoked.push(url);
        revoke(url);
      };
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
        configurable: true,
        value: async (constraints: MediaStreamConstraints) => {
          const setting =
            typeof constraints.video === "object" ? constraints.video.facingMode : undefined;
          cameraFacings.push(
            typeof setting === "object" &&
              setting !== null &&
              "ideal" in setting &&
              typeof setting.ideal === "string"
              ? setting.ideal
              : "user",
          );
          const canvas = document.createElement("canvas");
          canvas.width = 1920;
          canvas.height = 1440;
          const context = canvas.getContext("2d")!;
          const data = context.createImageData(canvas.width, canvas.height);
          let seed = 127;
          for (let i = 0; i < data.data.length; i += 4) {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            data.data[i] = (seed & 255) % (dark ? 60 : 256);
            data.data[i + 1] = ((seed >>> 8) & 255) % (dark ? 60 : 256);
            data.data[i + 2] = ((seed >>> 16) & 255) % (dark ? 60 : 256);
            data.data[i + 3] = 255;
          }
          if (defect === "blur") {
            context.fillStyle = "#9c7966";
            context.fillRect(0, 0, canvas.width, canvas.height);
          } else {
            context.putImageData(data, 0, 0);
          }
          const stream = canvas.captureStream(10);
          cameraStreams.push(stream);
          return stream;
        },
      });
    },
    { dark, defect },
  );
}
export async function streamsStopped(page: Page) {
  return page.evaluate(() =>
    (window.cameraStreams ?? []).every((stream) =>
      stream.getTracks().every((track) => track.readyState === "ended"),
    ),
  );
}
