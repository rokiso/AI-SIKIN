import "server-only";

export function isPhotoTestMode(): boolean {
  return process.env.PHOTO_TEST_MODE === "1" || !process.env.S3_VAULT_BUCKET;
}
