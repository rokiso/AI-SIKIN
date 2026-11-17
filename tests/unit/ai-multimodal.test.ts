// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const audit = vi.hoisted(() =>
  vi.fn(async (payload: Record<string, unknown>) => {
    void payload;
    return "SAVED" as const;
  }),
);
vi.mock("@/lib/ai/audit", () => ({ startAiAuditWrite: audit }));
import { callMultimodalAiWithTimeout, AiGatewayError, AiTimeoutError } from "@/lib/ai/multimodal";
import { getAiClientConfiguration, getAiHealthcheckToken } from "@/lib/server-env";
import { AI_HEALTHCHECK_IMAGE } from "@/lib/ai/healthcheck";
import { MAX_IMAGE_BYTES, validateImageReference } from "@/lib/ai/client";

const features = {
  extractedFeatures: {
    visualOilinessHint: "NORMAL",
    visualErythemaScore: 25,
    visualPigmentScore: 30,
    visualPoreWrinkleScore: 40,
    confidenceScore: 0.5,
  },
  clinicalImpressionSummary: "사진의 외관만 참고한 불확실한 안내입니다.",
  recommendedActiveIngredients: ["판테놀"],
  cautionIngredients: [],
};
const request = {
  imageUrl: AI_HEALTHCHECK_IMAGE,
  mimeType: "image/png" as const,
  surveyScores: { oiliness: 50, sensitivity: 50, pigmentation: 50, elasticity: 50 },
};
function openaiResponse(value: unknown = features) {
  return Response.json({
    status: "completed",
    output: [{ content: [{ type: "output_text", text: JSON.stringify(value) }] }],
    usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
  });
}
beforeEach(() => {
  audit.mockClear();
  vi.stubEnv("AI_LIVE_ENABLED", "1");
  vi.stubEnv("AI_PROVIDER", "OPENAI");
  vi.stubEnv("AI_API_KEY", "unit-test-key-not-a-real-key");
  vi.stubEnv("AI_MODEL_NAME", "test-model");
  vi.stubEnv("AI_REQUEST_TIMEOUT_MS", "8000");
  vi.stubEnv("S3_ENDPOINT", "https://vault.example.invalid");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("server-only AI foundation", () => {
  it("requires an explicit key and model and caps configured timeouts at eight seconds", () => {
    vi.stubEnv("AI_REQUEST_TIMEOUT_MS", "12000");
    expect(getAiClientConfiguration().timeoutMs).toBe(8000);
    vi.stubEnv("AI_MODEL_NAME", "");
    expect(() => getAiClientConfiguration()).toThrowError("AI 연결 설정");
    vi.stubEnv("AI_MODEL_NAME", "test-model");
    vi.stubEnv("AI_API_KEY", "");
    expect(() => getAiClientConfiguration()).toThrowError("AI 연결 설정");
  });
  it("has no default health token and rejects the old weak default", () => {
    vi.stubEnv("AI_HEALTHCHECK_TOKEN", "");
    expect(getAiHealthcheckToken()).toBeNull();
    vi.stubEnv("AI_HEALTHCHECK_TOKEN", "test-healthcheck-token");
    expect(getAiHealthcheckToken()).toBeNull();
  });
  it("does not call a provider without explicit live opt-in", async () => {
    vi.stubEnv("AI_LIVE_ENABLED", "");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(callMultimodalAiWithTimeout(request)).rejects.toMatchObject({
      code: "AI_DISABLED",
      fallbackTriggered: true,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("sends structured OpenAI input without provider storage and audits only metadata", async () => {
    const fetcher = vi.fn().mockResolvedValue(openaiResponse());
    vi.stubGlobal("fetch", fetcher);
    const result = await callMultimodalAiWithTimeout(request);
    expect(result).toMatchObject({
      success: true,
      model: "test-model",
      ...features,
      tokensUsed: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    });
    expect(await result.auditWrite).toBe("SAVED");
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/responses");
    const body = JSON.parse(options.body);
    expect(body.store).toBe(false);
    expect(body.text.format).toMatchObject({ type: "json_schema", strict: true });
    expect(body.input[0].content[1].image_url).toBe(AI_HEALTHCHECK_IMAGE);
    const data = audit.mock.calls[0][0];
    expect(data).toMatchObject({ status: "SUCCESS", provider: "OPENAI", totalTokens: 30 });
    expect(JSON.stringify(data)).not.toContain("base64");
    expect(JSON.stringify(data)).not.toContain("unit-test-key");
    expect(data.promptTemplateHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.rawPayloadHash).toMatch(/^[a-f0-9]{64}$/);
  });
  it("uses Gemini inline image data, JSON schema and a header key rather than a query key", async () => {
    vi.stubEnv("AI_PROVIDER", "GEMINI");
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        candidates: [
          { finishReason: "STOP", content: { parts: [{ text: JSON.stringify(features) }] } },
        ],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 },
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    expect(await callMultimodalAiWithTimeout(request)).toMatchObject({
      success: true,
      ...features,
    });
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent",
    );
    expect(options.headers["x-goog-api-key"]).toBe("unit-test-key-not-a-real-key");
    expect(JSON.parse(options.body).generationConfig.responseMimeType).toBe("application/json");
    expect(JSON.parse(options.body).contents[0].parts[1].inlineData.mimeType).toBe("image/png");
  });
  it("retries a transient failure once within the same deadline", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({}, { status: 503 }))
      .mockResolvedValueOnce(openaiResponse());
    vi.stubGlobal("fetch", fetcher);
    expect(await callMultimodalAiWithTimeout(request)).toMatchObject({ success: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(audit).toHaveBeenCalledTimes(1);
  });
  it("stops retrying after the second transient failure and never exposes upstream details", async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(async () =>
        Response.json({ error: "private-provider-key" }, { status: 500 }),
      );
    vi.stubGlobal("fetch", fetcher);
    await expect(callMultimodalAiWithTimeout(request)).rejects.toMatchObject({
      code: "AI_PROVIDER_ERROR",
      fallbackTriggered: true,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(audit.mock.calls)).not.toContain("private-provider-key");
  });
  it("does not retry authentication failures", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ error: "secret" }, { status: 401 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(callMultimodalAiWithTimeout(request)).rejects.toBeInstanceOf(AiGatewayError);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(audit.mock.calls[0][0]).toMatchObject({
      status: "ERROR",
      errorMessage: "AI_PROVIDER_ERROR",
    });
  });
  it("enforces the whole eight-second deadline even if fetch ignores abort", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetcher);
    const operation = callMultimodalAiWithTimeout(request);
    const assertion = expect(operation).rejects.toBeInstanceOf(AiTimeoutError);
    await vi.advanceTimersByTimeAsync(8000);
    await assertion;
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(audit.mock.calls[0][0]).toMatchObject({
      status: "TIMEOUT",
      errorMessage: "AI_GATEWAY_TIMEOUT",
    });
  });
  it("includes retry and backoff in the original deadline", async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({}, { status: 503 }))
      .mockImplementation(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetcher);
    const assertion = expect(callMultimodalAiWithTimeout(request)).rejects.toMatchObject({
      code: "AI_GATEWAY_TIMEOUT",
    });
    await vi.advanceTimersByTimeAsync(8000);
    await assertion;
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("also bounds response body reading rather than stopping its timer at headers", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode("{"));
            },
          }),
        ),
      ),
    );
    const assertion = expect(
      callMultimodalAiWithTimeout({ ...request, timeoutMs: 100 }),
    ).rejects.toBeInstanceOf(AiTimeoutError);
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
  });
  it.each([
    { ...features, extractedFeatures: { ...features.extractedFeatures, confidenceScore: 2 } },
    { ...features, clinicalImpressionSummary: "항생제를 처방받으세요" },
    { ...features, extra: "untrusted" },
  ])("rejects malformed or unsafe structured output", async (payload) => {
    const fetcher = vi.fn().mockResolvedValue(openaiResponse(payload));
    vi.stubGlobal("fetch", fetcher);
    await expect(callMultimodalAiWithTimeout(request)).rejects.toBeInstanceOf(AiGatewayError);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(audit.mock.calls[0][0].status).toBe("ERROR");
  });
  it("rejects missing or negative usage metadata", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          status: "completed",
          output: [],
          usage: { input_tokens: -1, output_tokens: 2, total_tokens: 1 },
        }),
      ),
    );
    await expect(callMultimodalAiWithTimeout(request)).rejects.toMatchObject({
      code: "AI_INVALID_RESPONSE",
    });
  });
  it.each([
    "http://127.0.0.1/private",
    "https://evil.invalid/image",
    "https://vault.example.invalid:8443/image",
    "https://user:pass@vault.example.invalid/image",
  ])("rejects unapproved image references %s", async (imageUrl) => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(callMultimodalAiWithTimeout({ ...request, imageUrl })).rejects.toMatchObject({
      code: "AI_INVALID_IMAGE",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("validates the image signature, canonical base64 and size", () => {
    expect(() => validateImageReference("data:image/png;base64,/9j/", "image/png")).toThrow();
    expect(() => validateImageReference("data:image/png;base64,!!!=", "image/png")).toThrow();
    const image = Buffer.alloc(MAX_IMAGE_BYTES + 1);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(image);
    expect(() =>
      validateImageReference(`data:image/png;base64,${image.toString("base64")}`, "image/png"),
    ).toThrow();
  });
  it("fetches only an approved image without forwarding the AI key or following redirects", async () => {
    const bytes = Buffer.from(AI_HEALTHCHECK_IMAGE.split(",")[1], "base64");
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(bytes, { headers: { "content-type": "image/png" } }))
      .mockResolvedValueOnce(openaiResponse());
    vi.stubGlobal("fetch", fetcher);
    await callMultimodalAiWithTimeout({
      ...request,
      imageUrl: "https://vault.example.invalid/private?signature=private",
    });
    expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: "error", cache: "no-store" });
    expect(fetcher.mock.calls[0][1].headers).toBeUndefined();
    expect(JSON.stringify(audit.mock.calls)).not.toContain("signature");
  });
  it("rejects invalid score input before network access", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await expect(
      callMultimodalAiWithTimeout({
        ...request,
        surveyScores: { ...request.surveyScores, oiliness: 101 },
      }),
    ).rejects.toMatchObject({ code: "AI_INVALID_REQUEST" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
