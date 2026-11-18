import type { Page } from "@playwright/test";
// Existing image tests verify their storage contracts with an explicitly
// consented synthetic actor. Separate consent tests verify the real gate.
export async function consentedPhotoActor(page: Page) {
  await page.route("**/api/v1/consents/status", (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          consentType: "BIOMETRIC_FACE_DATA",
          hasValidConsent: true,
          requiresReconsent: false,
          activeVersion: "test-photo",
          consentedVersion: "test-photo",
          consentedAt: "2026-11-18T00:00:00.000Z",
        },
      },
    }),
  );
}
