// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { signImageUpload } from "@/lib/storage/s3-vault";
afterEach(() => vi.unstubAllEnvs());
describe("S3 upload signing", () => {
  it("signs encryption, content type and length for a 900-second PUT with no PII", async () => {
    vi.stubEnv("S3_VAULT_BUCKET", "test-private-vault");
    vi.stubEnv("S3_VAULT_REGION", "ap-northeast-2");
    vi.stubEnv("AWS_ACCESS_KEY_ID", "unit-test-key");
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "unit-test-secret");
    vi.stubEnv("S3_ENDPOINT", "");
    const url = new URL(
      await signImageUpload("raw-faces/test.jpeg", {
        mimeType: "image/jpeg",
        fileSizeBytes: 10240,
      }),
    );
    expect(url.protocol).toBe("https:");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("900");
    const signed = url.searchParams.get("X-Amz-SignedHeaders")?.split(";");
    expect(signed).toEqual(
      expect.arrayContaining(["content-type", "content-length", "x-amz-server-side-encryption"]),
    );
    expect(url.searchParams.has("x-amz-checksum-crc32")).toBe(false);
  });
  it("fails closed with a safe error when credentials are missing", async () => {
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "");
    await expect(
      signImageUpload("raw-faces/test.jpeg", { mimeType: "image/jpeg", fileSizeBytes: 10240 }),
    ).rejects.toThrow("Image storage configuration is missing or invalid");
  });
});
