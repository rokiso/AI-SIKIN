import { z } from "zod";
export const providerSchema = z.enum(["google", "kakao"]);
export type Provider = z.infer<typeof providerSchema>;
export function safeReturnPath(value: unknown): string {
  if (typeof value !== "string" || !value) return "/";
  if (
    value.length > 2048 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\x00-\x20]/.test(value)
  )
    return "/";
  const url = new URL(value, "https://local.invalid");
  if (
    url.origin !== "https://local.invalid" ||
    url.pathname.startsWith("/auth/") ||
    url.pathname.startsWith("/api/")
  )
    return "/";
  return url.pathname + url.search + url.hash;
}
export const callbackSchema = z
  .object({ code: z.string().min(1).max(4096), state: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
  .strict();
