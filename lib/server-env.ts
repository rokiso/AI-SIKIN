import "server-only";
import { z } from "zod";

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
    bucket: z.string().min(3),
    region: z.string().min(1),
    accessKeyId: z.string().min(1),
    secretAccessKey: z.string().min(1),
    endpoint: z
      .url()
      .optional()
      .refine((value) => {
        if (!value) return true;
        const url = new URL(value);
        return (
          url.protocol === "https:" ||
          (process.env.NODE_ENV !== "production" &&
            url.protocol === "http:" &&
            ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
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
  if (!result.success) throw new Error("Image storage configuration is missing or invalid");
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
