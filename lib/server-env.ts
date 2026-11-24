import "server-only";
import { z } from "zod";
import { AiConfigurationError } from "@/lib/ai/errors";

const databaseUrlSchema = z.url({ protocol: /^postgres(?:ql)?$/ });

export function getProcedureCatalogSource(): "published" | "database" {
  const fallback = process.env.VERCEL === "1" ? "published" : "database";
  return z.enum(["published", "database"]).parse(process.env.PROCEDURE_CATALOG_SOURCE || fallback);
}
// Enable in production only after the safety-guide and quota migrations are ready.
export function isProcedureSafetyEnabled(): boolean {
  const value = process.env.PROCEDURE_SAFETY_ENABLED;
  if (value) return value === "1";
  return process.env.NODE_ENV !== "production" && process.env.VERCEL !== "1";
}

// New milestone tables must be migrated before enabling the production UI/writer.
export function isSnapshotMilestonesEnabled(): boolean {
  const value = process.env.SNAPSHOT_MILESTONES_ENABLED;
  if (value) return value === "1";
  return process.env.NODE_ENV !== "production" && process.env.VERCEL !== "1";
}

// Enable only after the diagnostic fallback columns are migrated. JSON metadata stays compatible.
export function isDiagnosticFallbackStorageEnabled(): boolean {
  const value = process.env.DIAGNOSTIC_FALLBACK_STORAGE_ENABLED;
  if (value) return value === "1";
  return process.env.NODE_ENV !== "production" && process.env.VERCEL !== "1";
}

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

export type OAuthConfigurationField =
  | "NEXT_PUBLIC_APP_URL"
  | "GOOGLE_CLIENT_ID"
  | "GOOGLE_CLIENT_SECRET"
  | "GOOGLE_REDIRECT_URI"
  | "KAKAO_CLIENT_ID"
  | "KAKAO_CLIENT_SECRET"
  | "KAKAO_REDIRECT_URI";

export class OAuthConfigurationError extends Error {
  constructor(public readonly invalidFields: OAuthConfigurationField[]) {
    // Do not retain Zod errors or input values: URLs and credentials may contain secrets.
    super(`OAuth configuration is missing or invalid (${invalidFields.join(", ")})`);
    this.name = "OAuthConfigurationError";
  }
}

export function getOAuthConfiguration(provider: "google" | "kakao") {
  const prefix = provider === "google" ? "GOOGLE" : "KAKAO";
  const credential = z
    .string()
    .min(1)
    .max(4096)
    .refine(
      (value) =>
        value === value.trim() &&
        !/^(replace-with-|your_|change[-_]?me$|undefined$|null$)/i.test(value),
    );
  const schema = z.object({
    clientId: credential,
    clientSecret: credential,
    appUrl: z.url().refine((value) => {
      if (!URL.canParse(value)) return false;
      const url = new URL(value);
      return (
        !url.username &&
        !url.password &&
        url.pathname === "/" &&
        !url.search &&
        !url.hash &&
        !/^(your-app|example)\./i.test(url.hostname) &&
        (url.protocol === "https:" ||
          (process.env.NODE_ENV !== "production" &&
            url.protocol === "http:" &&
            ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
      );
    }),
  });
  const result = schema.safeParse({
    clientId: process.env[`${prefix}_CLIENT_ID`],
    clientSecret: process.env[`${prefix}_CLIENT_SECRET`],
    appUrl: process.env.NEXT_PUBLIC_APP_URL,
  });
  if (!result.success) {
    const fields: Record<string, OAuthConfigurationField> = {
      clientId: `${prefix}_CLIENT_ID`,
      clientSecret: `${prefix}_CLIENT_SECRET`,
      appUrl: "NEXT_PUBLIC_APP_URL",
    };
    throw new OAuthConfigurationError([
      ...new Set(result.error.issues.map((issue) => fields[String(issue.path[0])])),
    ]);
  }
  const appUrl = new URL(result.data.appUrl).origin;
  const callbackUrl = new URL(`/auth/callback/${provider}`, appUrl).href;
  // An explicit override must match the callback actually consumed by the browser.
  // The API callback is a POST JSON endpoint, not an OAuth redirect destination.
  const redirect = process.env[`${prefix}_REDIRECT_URI`];
  if (redirect && redirect !== callbackUrl)
    throw new OAuthConfigurationError([`${prefix}_REDIRECT_URI`]);
  return { ...result.data, appUrl, callbackUrl };
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

export type AffiliatePartnerField = "AFFILIATE_PARTNER_ID" | "AFFILIATE_DEFAULT_PLATFORM";
export class AffiliateConfigurationError extends Error {
  constructor(public readonly invalidFields: AffiliatePartnerField[]) {
    super("Affiliate partner configuration is incomplete or invalid");
    this.name = "AffiliateConfigurationError";
  }
}
export function getAffiliatePartnerConfiguration() {
  const result = z
    .object({
      partnerId: z
        .string()
        .trim()
        .min(3)
        .max(256)
        .refine(
          (value) =>
            !/[\x00-\x1f\x7f]/.test(value) &&
            !/^(replace-with-|your-|AF1234567$|test$|demo$)/i.test(value),
        ),
      platform: z.string().regex(/^[A-Z][A-Z0-9_]{2,63}$/),
    })
    .safeParse({
      partnerId: process.env.AFFILIATE_PARTNER_ID,
      platform: process.env.AFFILIATE_DEFAULT_PLATFORM,
    });
  if (!result.success) {
    const fields: Record<string, AffiliatePartnerField> = {
      partnerId: "AFFILIATE_PARTNER_ID",
      platform: "AFFILIATE_DEFAULT_PLATFORM",
    };
    throw new AffiliateConfigurationError([
      ...new Set(result.error.issues.map((issue) => fields[String(issue.path[0])])),
    ]);
  }
  return result.data;
}

// Explicit opt-in after production migrations and real seller data are ready.
export function isCatalogPreviewOnly(): boolean {
  return process.env.CATALOG_LIVE_ENABLED !== "1";
}

export function isAiLiveEnabled(): boolean {
  return process.env.AI_LIVE_ENABLED === "1";
}

// Enable only after migration, storage erasure and retry/recreation verification.
export function isAccountDeletionEnabled(): boolean {
  return process.env.ACCOUNT_DELETION_ENABLED === "1";
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

export function getConsentTrustedIpHeader() {
  const result = z
    .enum(["x-forwarded-for", "x-real-ip", "x-vercel-forwarded-for"])
    .optional()
    .safeParse(process.env.CONSENT_TRUSTED_IP_HEADER || undefined);
  if (!result.success) throw new Error("CONSENT_TRUSTED_IP_HEADER configuration is invalid");
  return result.data;
}

export function getCatalogCronSecret(): string | undefined {
  return process.env.CRON_SECRET_TOKEN || undefined;
}
