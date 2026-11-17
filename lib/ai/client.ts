import "server-only";
import { z } from "zod";
import { getAiClientConfiguration } from "@/lib/server-env";
import { AiGatewayError } from "./errors";
import { tokensSchema, visionJsonSchema } from "./schema";

export type AiClientConfig = ReturnType<typeof getAiClientConfiguration>;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export async function readBoundedBody(response: Response, maxBytes: number): Promise<Buffer> {
  const reader = response.body?.getReader();
  if (!reader) throw new AiGatewayError();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new AiGatewayError("AI_INVALID_RESPONSE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

export function validateImageBytes(bytes: Buffer, mimeType: string): void {
  const valid =
    mimeType === "image/jpeg"
      ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      : mimeType === "image/png"
        ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP";
  if (!valid || bytes.length > MAX_IMAGE_BYTES)
    throw new AiGatewayError("AI_INVALID_IMAGE", "지원하는 이미지 파일을 확인해 주세요.", 400);
}

export function validateImageReference(imageUrl: string, mimeType: string): void {
  if (imageUrl.startsWith("data:")) {
    const prefix = `data:${mimeType};base64,`;
    const data = imageUrl.slice(prefix.length);
    if (
      !imageUrl.startsWith(prefix) ||
      data.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(data)
    )
      throw new AiGatewayError("AI_INVALID_IMAGE", "이미지 형식을 확인해 주세요.", 400);
    const bytes = Buffer.from(data, "base64");
    if (bytes.toString("base64") !== data)
      throw new AiGatewayError("AI_INVALID_IMAGE", "이미지 형식을 확인해 주세요.", 400);
    validateImageBytes(bytes, mimeType);
    return;
  }
  let url: URL;
  try {
    url = new URL(imageUrl);
  } catch {
    throw new AiGatewayError("AI_INVALID_IMAGE", "이미지 주소를 확인해 주세요.", 400);
  }
  const hosts = new Set<string>();
  const bucket = process.env.S3_VAULT_BUCKET;
  const region = process.env.S3_VAULT_REGION;
  if (bucket && region) hosts.add(`${bucket}.s3.${region}.amazonaws.com`);
  if (process.env.S3_ENDPOINT) {
    const endpoint = z.url().safeParse(process.env.S3_ENDPOINT);
    if (endpoint.success) hosts.add(new URL(endpoint.data).hostname);
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    url.port ||
    !hosts.has(url.hostname)
  )
    throw new AiGatewayError(
      "AI_INVALID_IMAGE",
      "등록된 보관소의 이미지 주소를 확인해 주세요.",
      400,
    );
}

export async function loadImageData(imageUrl: string, mimeType: string, signal: AbortSignal) {
  if (imageUrl.startsWith("data:")) return imageUrl;
  const response = await fetch(imageUrl, { signal, redirect: "error", cache: "no-store" });
  if (!response.ok || response.headers.get("content-type")?.split(";")[0] !== mimeType)
    throw new AiGatewayError("AI_INVALID_IMAGE", "사진을 읽지 못했습니다.", 400);
  const bytes = await readBoundedBody(response, MAX_IMAGE_BYTES);
  validateImageBytes(bytes, mimeType);
  return `data:${mimeType};base64,${bytes.toString("base64")}`;
}

export class RetryableAiError extends Error {}

export async function callAiProvider(
  config: AiClientConfig,
  imageData: string,
  mimeType: string,
  instruction: string,
  surveyScores: object,
  signal: AbortSignal,
) {
  const input = `문진 축 점수(시각 정보와 구분할 것): ${JSON.stringify(surveyScores)}`;
  const openai = config.provider === "OPENAI";
  const url = openai
    ? "https://api.openai.com/v1/responses"
    : `https://generativelanguage.googleapis.com/v1beta/models/${config.modelName}:generateContent`;
  const response = await fetch(url, {
    method: "POST",
    signal,
    cache: "no-store",
    redirect: "error",
    headers: {
      "Content-Type": "application/json",
      ...(openai
        ? { Authorization: `Bearer ${config.apiKey}` }
        : { "x-goog-api-key": config.apiKey }),
    },
    body: JSON.stringify(
      openai
        ? {
            model: config.modelName,
            store: false,
            max_output_tokens: 1500,
            instructions: instruction,
            input: [
              {
                role: "user",
                content: [
                  { type: "input_text", text: input },
                  { type: "input_image", image_url: imageData, detail: "low" },
                ],
              },
            ],
            text: {
              format: {
                type: "json_schema",
                name: "skin_visual_hints",
                strict: true,
                schema: visionJsonSchema,
              },
            },
          }
        : {
            systemInstruction: { parts: [{ text: instruction }] },
            contents: [
              {
                role: "user",
                parts: [
                  { text: input },
                  { inlineData: { mimeType, data: imageData.split(",")[1] } },
                ],
              },
            ],
            generationConfig: {
              maxOutputTokens: 1500,
              responseMimeType: "application/json",
              responseJsonSchema: visionJsonSchema,
            },
          },
    ),
  });
  if (!response.ok) {
    await response.body?.cancel();
    if (response.status === 429 || response.status >= 500) throw new RetryableAiError();
    throw new AiGatewayError();
  }
  const raw = (await readBoundedBody(response, 256 * 1024)).toString("utf8");
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new AiGatewayError("AI_INVALID_RESPONSE");
  }
  try {
    if (openai) {
      const envelope = z
        .object({
          status: z.literal("completed"),
          output: z.array(
            z.object({
              content: z
                .array(z.object({ type: z.string(), text: z.string().optional() }))
                .optional(),
            }),
          ),
          usage: z.object({
            input_tokens: z.number(),
            output_tokens: z.number(),
            total_tokens: z.number(),
          }),
        })
        .parse(payload);
      return {
        raw,
        text: envelope.output
          .flatMap((item) => item.content ?? [])
          .filter((item) => item.type === "output_text")
          .map((item) => item.text ?? "")
          .join(""),
        tokensUsed: tokensSchema.parse({
          promptTokens: envelope.usage.input_tokens,
          completionTokens: envelope.usage.output_tokens,
          totalTokens: envelope.usage.total_tokens,
        }),
      };
    }
    const envelope = z
      .object({
        candidates: z
          .array(
            z.object({
              finishReason: z.literal("STOP"),
              content: z.object({ parts: z.array(z.object({ text: z.string() })) }),
            }),
          )
          .length(1),
        usageMetadata: z.object({
          promptTokenCount: z.number(),
          candidatesTokenCount: z.number(),
          totalTokenCount: z.number(),
        }),
      })
      .parse(payload);
    return {
      raw,
      text: envelope.candidates[0].content.parts.map((part) => part.text).join(""),
      tokensUsed: tokensSchema.parse({
        promptTokens: envelope.usageMetadata.promptTokenCount,
        completionTokens: envelope.usageMetadata.candidatesTokenCount,
        totalTokens: envelope.usageMetadata.totalTokenCount,
      }),
    };
  } catch {
    throw new AiGatewayError("AI_INVALID_RESPONSE");
  }
}
