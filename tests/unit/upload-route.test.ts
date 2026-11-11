// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ identity: vi.fn(), create: vi.fn(), complete: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/session/identity", () => ({
  readSessionCookies: () => ({}),
  resolveRequestIdentity: mocks.identity,
}));
vi.mock("@/lib/diagnostic/upload-session", async (original) => {
  const actual = await original<typeof import("@/lib/diagnostic/upload-session")>();
  return { ...actual, createUpload: mocks.create, completeUpload: mocks.complete };
});
import { POST as issue } from "@/app/api/v1/diagnostics/upload-url/route";
import { POST as complete } from "@/app/api/v1/diagnostics/upload-complete/route";
import { UploadError } from "@/lib/diagnostic/upload-session";
function request(body: string, extra: Record<string, string> = {}) {
  return new Request("https://sikin.test/api/v1/diagnostics/upload-url", {
    method: "POST",
    headers: { "content-type": "application/json", ...extra },
    body,
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.identity.mockResolvedValue({ kind: "guest", guestDeviceId: "verified-cookie" });
});
describe("upload API boundaries", () => {
  it("uses verified cookies and private envelopes, ignoring identity headers", async () => {
    mocks.create.mockResolvedValue({ uploadSessionId: "new-upload" });
    const result = await issue(
      request(JSON.stringify({ mimeType: "image/jpeg", fileSizeBytes: 10240 }), {
        "x-user-id": "victim",
      }),
    );
    expect(result.status).toBe(201);
    expect(result.headers.get("cache-control")).toBe("private, no-store");
    expect(await result.json()).toEqual({ success: true, data: { uploadSessionId: "new-upload" } });
    expect(mocks.create).toHaveBeenCalledWith(
      { kind: "guest", guestDeviceId: "verified-cookie" },
      { mimeType: "image/jpeg", fileSizeBytes: 10240 },
    );
  });
  it("rejects anonymous, cross-site, malformed, oversized and invalid requests", async () => {
    mocks.identity.mockResolvedValueOnce({ kind: "anonymous" });
    expect((await issue(request("{}"))).status).toBe(401);
    expect((await issue(request("{}", { origin: "https://evil.test" }))).status).toBe(403);
    for (const body of [
      "{broken",
      "a".repeat(4097),
      JSON.stringify({ mimeType: "image/gif", fileSizeBytes: 10240 }),
    ])
      expect((await issue(request(body))).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("returns domain errors and redacts unexpected failures", async () => {
    const body = JSON.stringify({
      uploadSessionId: "12345678-1234-4234-8234-123456789012",
      etag: '"0123456789abcdef0123456789abcdef"',
    });
    mocks.complete.mockRejectedValueOnce(
      new UploadError(403, "FORBIDDEN_UPLOAD_SESSION", "권한이 없습니다."),
    );
    expect((await complete(request(body))).status).toBe(403);
    mocks.complete.mockRejectedValueOnce(new Error("private-storage-credentials"));
    const logger = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await complete(request(body));
    expect(result.status).toBe(503);
    expect(JSON.stringify(await result.json())).not.toContain("private-storage-credentials");
    expect(logger).toHaveBeenCalledWith("[diagnostic-upload] Upload operation failed");
  });
});
