import { describe, expect, it } from "vitest";
import {
  uploadCompleteSchema,
  uploadFileSchema,
  uploadEtagSchema,
} from "@/lib/diagnostic/upload-validation";
describe("upload input contracts", () => {
  it.each([
    [10239, false],
    [10240, true],
    [10485760, true],
    [10485761, false],
    [10240.5, false],
  ])("validates size %s", (fileSizeBytes, valid) => {
    expect(uploadFileSchema.safeParse({ mimeType: "image/jpeg", fileSizeBytes }).success).toBe(
      valid,
    );
  });
  it.each(["image/jpeg", "image/png", "image/webp", "image/gif", "text/plain", "application/pdf"])(
    "validates %s",
    (mimeType) => {
      expect(uploadFileSchema.safeParse({ mimeType, fileSizeBytes: 10240 }).success).toBe(
        ["image/jpeg", "image/png", "image/webp"].includes(mimeType),
      );
    },
  );
  it("rejects ownership fields, forged resource paths and malformed ETags", () => {
    expect(
      uploadFileSchema.safeParse({ mimeType: "image/jpeg", fileSizeBytes: 10240, userId: "victim" })
        .success,
    ).toBe(false);
    expect(
      uploadCompleteSchema.safeParse({ uploadSessionId: "../../victim", etag: "arbitrary" })
        .success,
    ).toBe(false);
  });
});

describe("ETag compatibility", () => {
  it("canonicalizes balanced quoted and unquoted ETags, preserving case and multipart suffix", () => {
    for (const tag of ["0123456789abcdef0123456789abcdef", "ABCDEF0123456789ABCDEF0123456789-2"]) {
      expect(uploadEtagSchema.parse(tag)).toBe(`"${tag}"`);
      expect(uploadEtagSchema.parse(`"${tag}"`)).toBe(`"${tag}"`);
    }
    for (const invalid of [
      '"0123456789abcdef0123456789abcdef',
      '0123456789abcdef0123456789abcdef"',
      "arbitrary",
      "",
      " " + "a".repeat(32),
    ])
      expect(uploadEtagSchema.safeParse(invalid).success).toBe(false);
  });
});
