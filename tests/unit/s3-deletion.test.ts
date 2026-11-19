// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ send: vi.fn(), destroy: vi.fn() }));
vi.mock("@aws-sdk/client-s3", async (original) => {
  const sdk = await original<typeof import("@aws-sdk/client-s3")>();
  return {
    ...sdk,
    S3Client: class {
      send = mocks.send;
      destroy = mocks.destroy;
    },
  };
});
import {
  DeleteObjectsCommand,
  GetBucketVersioningCommand,
  ListObjectVersionsCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { deleteImageObjects } from "@/lib/storage/s3-vault";
beforeEach(() => {
  vi.stubEnv("S3_VAULT_BUCKET", "deletion-test.invalid");
  vi.stubEnv("S3_VAULT_REGION", "ap-northeast-2");
  vi.stubEnv("AWS_ACCESS_KEY_ID", "test-only");
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", "test-only");
  mocks.send.mockReset();
  mocks.destroy.mockReset();
});
afterEach(() => vi.unstubAllEnvs());
const signal = () => AbortSignal.timeout(5000);
const key = "raw-faces/test.jpg";
describe("permanent image deletion", () => {
  it("does not access storage for an empty set and rejects unexpected namespaces", async () => {
    expect(await deleteImageObjects([], signal())).toBe(0);
    await expect(deleteImageObjects(["other/private.jpg"], signal())).rejects.toThrow();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("deduplicates and splits 1001 keys, requiring acknowledgements and absence", async () => {
    const keys = Array.from({ length: 1001 }, (_, i) => `raw-faces/test-${i}.jpg`);
    mocks.send.mockImplementation(async (command) => {
      if (command instanceof GetBucketVersioningCommand) return {};
      if (command instanceof DeleteObjectsCommand)
        return { Deleted: command.input.Delete?.Objects };
      if (command instanceof ListObjectsV2Command) return {};
      throw new Error("Unexpected command");
    });
    expect(await deleteImageObjects([...keys, keys[0]], signal())).toBe(1001);
    const batches = mocks.send.mock.calls
      .map(([c]) => c)
      .filter((c) => c instanceof DeleteObjectsCommand);
    expect(batches.map((c) => c.input.Delete?.Objects?.length)).toEqual([1000, 1]);
    expect(mocks.destroy).toHaveBeenCalledOnce();
  });
  it.each(["Enabled", "Suspended"])(
    "erases exact-key versions and markers for %s buckets with pagination",
    async (status) => {
      let lists = 0;
      mocks.send.mockImplementation(async (command) => {
        if (command instanceof GetBucketVersioningCommand) return { Status: status };
        if (command instanceof ListObjectVersionsCommand) {
          lists++;
          if (lists === 1)
            return {
              Versions: [
                { Key: key, VersionId: "v1" },
                { Key: `${key}-other`, VersionId: "foreign" },
              ],
              IsTruncated: true,
              NextKeyMarker: key,
              NextVersionIdMarker: "v1",
            };
          if (lists === 2) {
            expect(command.input.VersionIdMarker).toBe("v1");
            return {
              DeleteMarkers: [
                { Key: key, VersionId: "marker" },
                { Key: key, VersionId: "null" },
              ],
            };
          }
          return {};
        }
        if (command instanceof DeleteObjectsCommand) {
          expect(command.input.Delete?.Objects).toEqual([
            { Key: key, VersionId: "v1" },
            { Key: key, VersionId: "marker" },
            { Key: key, VersionId: "null" },
          ]);
          return { Deleted: command.input.Delete?.Objects };
        }
        throw new Error("Unexpected command");
      });
      expect(await deleteImageObjects([key], signal())).toBe(1);
      expect(lists).toBe(3);
    },
  );
  it.each(["partial", "unacknowledged", "still-present", "permission"])(
    "fails closed for %s results",
    async (mode) => {
      mocks.send.mockImplementation(async (command) => {
        if (command instanceof GetBucketVersioningCommand) {
          if (mode === "permission") throw new Error("Denied");
          return {};
        }
        if (command instanceof DeleteObjectsCommand)
          return mode === "partial"
            ? { Errors: [{ Key: key, Code: "AccessDenied" }] }
            : mode === "unacknowledged"
              ? {}
              : { Deleted: [{ Key: key }] };
        if (command instanceof ListObjectsV2Command) return { Contents: [{ Key: key }] };
        throw new Error("Unexpected command");
      });
      await expect(deleteImageObjects([key], signal())).rejects.toThrow();
      expect(mocks.destroy).toHaveBeenCalledOnce();
    },
  );
  it("rejects deletion markers that hide remaining old versions", async () => {
    mocks.send.mockImplementation(async (command) => {
      if (command instanceof GetBucketVersioningCommand) return { Status: "Enabled" };
      if (command instanceof ListObjectVersionsCommand)
        return { Versions: [{ Key: key, VersionId: "retained" }] };
      if (command instanceof DeleteObjectsCommand)
        return { Deleted: command.input.Delete?.Objects };
      throw new Error("Unexpected command");
    });
    await expect(deleteImageObjects([key], signal())).rejects.toThrow("remain");
  });
});
