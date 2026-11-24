import type { Page } from "@playwright/test";

export function mockFaceDetector(page: Page, detected = true) {
  return page.addInitScript((hasFace) => {
    Object.defineProperty(window, "FaceDetector", {
      configurable: true,
      value: class {
        async detect(canvas: HTMLCanvasElement) {
          return hasFace
            ? [
                {
                  boundingBox: {
                    x: canvas.width / 4,
                    y: canvas.height / 4,
                    width: canvas.width / 2,
                    height: canvas.height / 2,
                  },
                },
              ]
            : [];
        }
      },
    });
  }, detected);
}
