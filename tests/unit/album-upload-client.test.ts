// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeETag, uploadDiagnosticImage } from "@/lib/api/diagnosticUploadClient";
const id = "12345678-1234-4234-8234-123456789012";
const key = `raw-faces/${id}.jpeg`;
const etag = '"0123456789abcdef0123456789abcdef"';
const image = {
  blob: new Blob([new Uint8Array(10240)], { type: "image/jpeg" }),
  mimeType: "image/jpeg" as const,
  fileSizeBytes: 10240,
  width: 1280,
  height: 640,
  previewUrl: "blob:private-preview",
};
class FakeXHR {
  static fail = false;
  static etag: string | null = etag;
  static requests: FakeXHR[] = [];
  status = 200;
  timeout = 0;
  withCredentials = false;
  headers: Record<string, string> = {};
  body: Blob | null = null;
  upload: {
    onprogress:
      ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null;
  } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  open = vi.fn();
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  getResponseHeader() {
    return FakeXHR.etag;
  }
  abort() {
    this.onabort?.();
  }
  send(blob: Blob) {
    this.body = blob;
    FakeXHR.requests.push(this);
    queueMicrotask(() => {
      this.upload.onprogress?.({ lengthComputable: true, loaded: 10240, total: 10240 });
      if (FakeXHR.fail) this.onerror?.();
      else this.onload?.();
    });
  }
}
function issue() {
  return Response.json(
    {
      success: true,
      data: {
        uploadSessionId: id,
        s3Key: key,
        uploadUrl: "https://test-vault.invalid/signed",
        expiresInSeconds: 900,
      },
    },
    { status: 201 },
  );
}
function confirm() {
  return Response.json({
    success: true,
    data: {
      uploadSessionId: id,
      s3Key: key,
      status: "UPLOADED",
      confirmedAt: new Date().toISOString(),
    },
  });
}
beforeEach(() => {
  vi.stubGlobal("XMLHttpRequest", FakeXHR);
  FakeXHR.fail = false;
  FakeXHR.etag = etag;
  FakeXHR.requests = [];
});
afterEach(() => {
  vi.unstubAllGlobals();
});
describe("album direct upload contract", () => {
  it("issues URL, PUTs only the processed blob with AES256, and confirms the quoted ETag", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(issue()).mockResolvedValueOnce(confirm());
    vi.stubGlobal("fetch", fetcher);
    const report = vi.fn();
    expect(await uploadDiagnosticImage(image, new AbortController().signal, report)).toEqual({
      uploadSessionId: id,
      s3Key: key,
      previewUrl: image.previewUrl,
    });
    expect(FakeXHR.requests[0].body).toBe(image.blob);
    expect(FakeXHR.requests[0].headers).toEqual({
      "Content-Type": "image/jpeg",
      "x-amz-server-side-encryption": "AES256",
    });
    expect(FakeXHR.requests[0].withCredentials).toBe(false);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
      mimeType: "image/jpeg",
      fileSizeBytes: 10240,
    });
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ uploadSessionId: id, etag });
    expect(report).toHaveBeenCalledWith("transfer", 100);
  });
  it("maps rate limits without uploading data", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { success: false, error: { code: "RATE_LIMIT_EXCEEDED" } },
            { status: 429 },
          ),
        ),
    );
    await expect(
      uploadDiagnosticImage(image, new AbortController().signal, vi.fn()),
    ).rejects.toThrow("1시간 후");
    expect(FakeXHR.requests).toHaveLength(0);
  });
  it("does not confirm an interrupted PUT", async () => {
    FakeXHR.fail = true;
    const fetcher = vi.fn().mockResolvedValue(issue());
    vi.stubGlobal("fetch", fetcher);
    await expect(
      uploadDiagnosticImage(image, new AbortController().signal, vi.fn()),
    ).rejects.toMatchObject({ phase: "transfer" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("does not invent missing ETags or accept mismatched confirmations", async () => {
    expect(() => normalizeETag(null)).toThrow();
    expect(normalizeETag(etag.slice(1, -1))).toBe(etag);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(issue())
        .mockResolvedValueOnce(
          Response.json({
            success: true,
            data: {
              uploadSessionId: id,
              s3Key: `raw-faces/22345678-1234-4234-8234-123456789012.jpeg`,
              status: "UPLOADED",
              confirmedAt: new Date().toISOString(),
            },
          }),
        ),
    );
    await expect(
      uploadDiagnosticImage(image, new AbortController().signal, vi.fn()),
    ).rejects.toMatchObject({ phase: "confirm" });
  });
});
