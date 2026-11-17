import "server-only";
import { z } from "zod";
import { AiConfigurationError } from "@/lib/ai/errors";

const databaseUrlSchema = z.url({ protocol: /^postgres(?:ql)?$/ });

export function getOptionalDatabaseUrl(): string | undefined {
  const value = process.env.DATABASE_URL;
  if (value === undefined || value === "") return undefined;
  const result = databaseUrlSchema.safeParse(value);
  if (!result.success) throw new Error("Database configuration is invalid");
  return result.data;
}

export function getDatabaseUrl(): string {
  const value = getOptionalDatabaseUrl();
  if (!value) throw new Error("Database configuration is missing");
  return value;
}

export function getAuthCookieSecret(): string {
  const result = z
    .string()
    .min(32)
    .max(1024)
    .refine((value) => !value.startsWith("replace-with-"))
    .safeParse(process.env.AUTH_COOKIE_SECRET);
  if (!result.success) throw new Error("Session signing configuration is missing or invalid");
  return result.data;
}

export function getVaultConfiguration() {
  const schema = z.object({
    bucket: z
      .string()
      .min(3)
      .refine((value) => !value.startsWith("replace-with-")),
    region: z
      .string()
      .min(1)
      .refine((value) => !value.startsWith("replace-with-")),
    accessKeyId: z
      .string()
      .min(1)
      .refine((value) => !value.startsWith("replace-with-")),
    secretAccessKey: z
      .string()
      .min(1)
      .refine((value) => !value.startsWith("replace-with-")),
    endpoint: z
      .url()
      .optional()
      .refine((value) => {
        if (!value) return true;
        const url = new URL(value);
        return (
          !url.username &&
          !url.password &&
          !url.search &&
          !url.hash &&
          (url.protocol === "https:" ||
            (process.env.NODE_ENV !== "production" &&
              url.protocol === "http:" &&
              ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
        );
      }),
  });
  const result = schema.safeParse({
    bucket: process.env.S3_VAULT_BUCKET,
    region: process.env.S3_VAULT_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    endpoint: process.env.S3_ENDPOINT || undefined,
  });
  if (!result.success) {
    const fields = new Map([
      ["bucket", "S3_VAULT_BUCKET"],
      ["region", "S3_VAULT_REGION"],
      ["accessKeyId", "AWS_ACCESS_KEY_ID"],
      ["secretAccessKey", "AWS_SECRET_ACCESS_KEY"],
      ["endpoint", "S3_ENDPOINT"],
    ]);
    const invalid = [
      ...new Set(
        result.error.issues.map((issue) => fields.get(String(issue.path[0]))).filter(Boolean),
      ),
    ];
    // Report field names only, never Zod input data or credential values.
    throw new Error(`Image storage configuration is missing or invalid (${invalid.join(", ")})`);
  }
  return result.data;
}

export function getOAuthConfiguration(provider: "google" | "kakao") {
  const prefix = provider === "google" ? "GOOGLE" : "KAKAO";
  const schema = z.object({
    clientId: z
      .string()
      .min(1)
      .refine((value) => !value.startsWith("replace-with-")),
    clientSecret: z
      .string()
      .min(1)
      .refine((value) => !value.startsWith("replace-with-")),
    appUrl: z.url().refine((value) => {
      const url = new URL(value);
      return (
        !url.username &&
        !url.password &&
        url.pathname === "/" &&
        !url.search &&
        !url.hash &&
        (url.protocol === "https:" ||
          (process.env.NODE_ENV !== "production" &&
            url.protocol === "http:" &&
            ["localhost", "127.0.0.1"].includes(url.hostname)))
      );
    }),
  });
  const result = schema.safeParse({
    clientId: process.env[`${prefix}_CLIENT_ID`],
    clientSecret: process.env[`${prefix}_CLIENT_SECRET`],
    appUrl: process.env.NEXT_PUBLIC_APP_URL,
  });
  if (!result.success) throw new Error("OAuth configuration is missing or invalid");
  return {
    ...result.data,
    callbackUrl: new URL(`/auth/callback/${provider}`, result.data.appUrl).href,
  };
}

export function getSnapshotAiConfiguration(): { apiKey: string; model: string } | null {
  const apiKey = process.env.SNAPSHOT_AI_API_KEY;
  const model = process.env.SNAPSHOT_AI_MODEL;
  if (!apiKey && !model) return null;
  const parsed = z
    .object({
      apiKey: z
        .string()
        .min(1)
        .refine((value) => !value.startsWith("replace-with-")),
      model: z.string().min(1).max(100),
    })
    .safeParse({ apiKey, model });
  if (!parsed.success) throw new Error("Snapshot AI configuration is incomplete");
  return parsed.data;
}

export function getAffiliateHosts(): Set<string> {
  const value = process.env.CATALOG_AFFILIATE_HOSTS ?? "";
  return new Set(
    value
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  );
}

// Explicit opt-in after production migrations and real seller data are ready.
export function isCatalogPreviewOnly(): boolean {
  return process.env.CATALOG_LIVE_ENABLED !== "1";
}

export function isAiLiveEnabled(): boolean {
  return process.env.AI_LIVE_ENABLED === "1";
}

export function getAiClientConfiguration() {
  const result = z
    .object({
      provider: z.enum(["OPENAI", "GEMINI"]),
      apiKey: z
        .string()
        .min(1)
        .max(4096)
        .refine((value) => !value.startsWith("replace-with-")),
      modelName: z
        .string()
        .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/)
        .refine((value) => !value.startsWith("replace-with-")),
      timeoutMs: z.coerce
        .number()
        .int()
        .positive()
        .transform((value) => Math.min(value, 8000)),
    })
    .safeParse({
      provider: process.env.AI_PROVIDER ?? "OPENAI",
      apiKey: process.env.AI_API_KEY,
      modelName: process.env.AI_MODEL_NAME,
      timeoutMs: process.env.AI_REQUEST_TIMEOUT_MS ?? "8000",
    });
  if (!result.success) throw new AiConfigurationError();
  return { ...result.data, maxRetries: 1 as const };
}

export function getAiHealthcheckToken(): string | null {
  const value = process.env.AI_HEALTHCHECK_TOKEN;
  return value && /^[A-Za-z0-9_-]{32,256}$/.test(value) && !value.startsWith("replace-with-")
    ? value
    : null;
}
