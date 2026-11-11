import { z } from "zod";

export const GUEST_COOKIE_NAME = "x-guest-session-id";
export const GUEST_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
const guestIdSchema = z.uuidv4();

export function parseGuestId(value: string | undefined): string | null {
  const parsed = guestIdSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
