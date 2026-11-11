import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { getAuthCookieSecret } from "@/lib/server-env";
import { providerSchema } from "./validation";
export const OAUTH_COOKIE = "oauth_pkce_payload";
export const FLOW_SECONDS = 300;
export function digest(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}
export function generatePkcePair() {
  const codeVerifier = randomBytes(32).toString("base64url");
  return { codeVerifier, codeChallenge: digest(codeVerifier) };
}
const payloadSchema = z.object({
  state: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  verifier: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  provider: providerSchema,
  returnPath: z.string().max(2048),
  expires: z.number().int(),
  guestId: z.uuid().nullable(),
});
export type OAuthPayload = z.infer<typeof payloadSchema>;
function key() {
  return createHash("sha256").update(`sikin:oauth:v1:${getAuthCookieSecret()}`).digest();
}
export function signStateCookie(payload: OAuthPayload) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(OAUTH_COOKIE));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}
export function verifyStateCookie(
  value: string | undefined,
  now = Date.now(),
): OAuthPayload | null {
  if (!value || value.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const bytes = Buffer.from(value, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key(), bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from(OAUTH_COOKIE));
    decipher.setAuthTag(bytes.subarray(12, 28));
    const clear = Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString();
    const result = payloadSchema.safeParse(JSON.parse(clear));
    if (
      !result.success ||
      result.data.expires <= now ||
      result.data.expires > now + FLOW_SECONDS * 1000
    )
      return null;
    return result.data;
  } catch {
    return null;
  } // Untrusted cookies fail authentication; never treat decryption failure as a session.
}
