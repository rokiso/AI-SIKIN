import "server-only";
import { createHmac } from "node:crypto";
import { getPrisma } from "@/lib/prisma";
import { getAuthCookieSecret } from "@/lib/server-env";
import { consentRequestMetadata } from "@/lib/server/getClientIp";
import { AuthError } from "@/lib/auth/response";
export class SafetyRateLimitError extends AuthError {
  constructor(public readonly retryAfter: number) {
    super(429, "PROCEDURE_RATE_LIMITED", "시술 정보 요청이 많습니다. 잠시 후 다시 시도해 주세요.");
  }
}
export async function enforceSafetyRateLimit(headers: Headers, now = new Date()) {
  if (!Number.isFinite(now.getTime())) throw new RangeError("Invalid quota time");
  const ip = consentRequestMetadata(headers).ipAddress;
  const canonical = ip?.includes(":") ? new URL(`http://[${ip}]/`).hostname : ip;
  const minute = Math.floor(now.getTime() / 60000);
  // Without a trusted overwriting ingress use one shared quota, not a caller's
  // spoofable forwarding header or a synthesized client IP.
  const hash = createHmac("sha256", getAuthCookieSecret())
    .update(`miruvia:safety-quota:v1:${minute}:${canonical ?? "UNATTRIBUTED"}`)
    .digest("hex");
  const expires = new Date((minute + 2) * 60000);
  const rows = await getPrisma().$queryRaw<{ request_count: number }[]>`
 WITH expired AS (DELETE FROM procedure_safety_rate_limits WHERE expires_at < ${now})
 INSERT INTO procedure_safety_rate_limits (key_hash,request_count,expires_at)
 VALUES (${hash},1,${expires})
 ON CONFLICT (key_hash) DO UPDATE SET request_count=LEAST(procedure_safety_rate_limits.request_count+1,121)
 RETURNING request_count`;
  if (!rows[0]) throw Error("Safety quota unavailable");
  if (rows[0].request_count > 120)
    throw new SafetyRateLimitError(
      Math.max(1, Math.ceil(((minute + 1) * 60000 - now.getTime()) / 1000)),
    );
}
