import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { getAiHealthcheckToken } from "@/lib/server-env";
import { AuthError, requireSameOrigin } from "@/lib/auth/response";
import type { VerifiedIdentity } from "@/lib/session/identity-types";

export function isAiSystemRequest(request: Request): boolean {
  const expected = getAiHealthcheckToken();
  const token = request.headers.get("x-system-healthcheck-token");
  if (!expected || !token || token.length > 256) return false;
  return timingSafeEqual(
    createHash("sha256").update(expected).digest(),
    createHash("sha256").update(token).digest(),
  );
}

export function authorizeAiAdmin(request: Request, identity: VerifiedIdentity): string {
  if (identity.kind !== "member")
    throw new AuthError(401, "SESSION_REQUIRED", "인증이 필요합니다.");
  if (identity.role !== "ADMIN")
    throw new AuthError(403, "ADMIN_REQUIRED", "관리자 권한이 필요합니다.");
  requireSameOrigin(request);
  return `admin:${identity.userId}`;
}

// Per-instance safety guard, not a claim of a distributed quota.
const windows = new Map<string, { start: number; count: number }>();
export function consumeAiHealthcheckLimit(principal: string, now = Date.now()): void {
  for (const [key, window] of windows) if (now - window.start >= 60_000) windows.delete(key);
  let window = windows.get(principal);
  if (!window) {
    if (windows.size >= 1024)
      throw new AuthError(429, "AI_RATE_LIMIT_EXCEEDED", "잠시 후 다시 확인해 주세요.");
    window = { start: now, count: 0 };
    windows.set(principal, window);
  }
  if (window.count >= 10)
    throw new AuthError(
      429,
      "AI_RATE_LIMIT_EXCEEDED",
      "점검 요청이 많습니다. 잠시 후 다시 확인해 주세요.",
    );
  window.count++;
}

// Synthetic one-pixel PNG is only a connectivity fixture, never a real face.
export const AI_HEALTHCHECK_IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lZ8AAAAASUVORK5CYII=";
