// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/storage/s3-vault", () => ({
  signImageView: async () => "https://private-vault.invalid/short-lived-image",
}));
import { generateSnapshotFeedback } from "@/lib/snapshot/feedback";
beforeEach(() => {
  vi.stubEnv("SNAPSHOT_AI_API_KEY", "");
  vi.stubEnv("SNAPSHOT_AI_MODEL", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("daily feedback source transparency", () => {
  it("does not call a provider or invent conditions when AI is unconfigured", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect(await generateSnapshotFeedback("daily-snapshots/test.jpg")).toMatchObject({
      faceDetected: null,
      feedbackSource: "GENERAL_GUIDANCE",
      conditions: null,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("requests only the image reference, avoids provider storage and validates the structured assessment", async () => {
    vi.stubEnv("SNAPSHOT_AI_API_KEY", "test-only-key");
    vi.stubEnv("SNAPSHOT_AI_MODEL", "test-model");
    const content = {
      faceDetected: true,
      hydrationLevel: "BALANCED",
      soothingLevel: "HIGH",
      sebumLevel: "LOW",
      feedbackComment: "사진을 참고한 안내입니다. 보습을 챙겨주세요.",
    };
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json({
          status: "completed",
          output: [{ content: [{ type: "output_text", text: JSON.stringify(content) }] }],
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    expect(await generateSnapshotFeedback("daily-snapshots/test.jpg")).toMatchObject({
      feedbackSource: "AI",
      faceDetected: true,
      conditions: { hydrationLevel: "BALANCED", soothingLevel: "HIGH", sebumLevel: "LOW" },
    });
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body.store).toBe(false);
    expect(body.input[0].content[1].image_url).toBe(
      "https://private-vault.invalid/short-lived-image",
    );
  });
  it("returns visible general guidance on timeout, invalid responses or unsafe advice", async () => {
    vi.stubEnv("SNAPSHOT_AI_API_KEY", "test-only-key");
    vi.stubEnv("SNAPSHOT_AI_MODEL", "test-model");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private-key-details")));
    const logger = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await generateSnapshotFeedback("daily-snapshots/test.jpg");
    expect(result.feedbackSource).toBe("GENERAL_GUIDANCE");
    expect(result.conditions).toBeNull();
    expect(result.feedbackComment).toContain("분석을 완료하지 못해");
    expect(JSON.stringify(result)).not.toContain("private-key-details");
    expect(logger).toHaveBeenCalledWith(
      "[snapshot-ai] Analysis unavailable; returning explicit general guidance",
    );
  });
});
