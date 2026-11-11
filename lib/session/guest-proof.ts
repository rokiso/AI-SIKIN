import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { getAuthCookieSecret } from "@/lib/server-env";
import { GUEST_COOKIE_MAX_AGE, parseGuestId } from "./guest";

export const GUEST_PROOF_COOKIE_NAME = "sikin_guest_proof";

function signature(payload: string): Buffer {
  return createHmac("sha256", getAuthCookieSecret()).update(payload).digest();
}

// Only generate new server-owned identifiers. Never sign a supplied UUID.
export function createGuestSession(now = new Date()): { guestDeviceId: string; proof: string } {
  const guestDeviceId = randomUUID();
  const expires = Math.floor(now.getTime() / 1000) + GUEST_COOKIE_MAX_AGE;
  const payload = `v1.${guestDeviceId}.${expires}`;
  return { guestDeviceId, proof: `${payload}.${signature(payload).toString("base64url")}` };
}

export function verifyGuestProof(guestDeviceId: string | undefined, proof: string | undefined, now = new Date()): boolean {
  if (!parseGuestId(guestDeviceId) || !proof || proof.length > 160) return false;
  const parts = proof.split(".");
  if (parts.length !== 4 || parts[0] !== "v1" || parts[1] !== guestDeviceId ||
      !/^\d{10,13}$/.test(parts[2]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[3])) return false;
  const expires = Number(parts[2]);
  const seconds = Math.floor(now.getTime() / 1000);
  if (!Number.isSafeInteger(expires) || expires <= seconds || expires > seconds + GUEST_COOKIE_MAX_AGE) return false;
  const expected = signature(parts.slice(0, 3).join("."));
  const supplied = Buffer.from(parts[3], "base64url");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
