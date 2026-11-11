import "server-only";

import { cookies } from "next/headers";
import { readSessionCookies, resolveRequestIdentity } from "./identity";
import type { AppUserSession } from "./types";

export async function getAppUserSession(): Promise<AppUserSession> {
  const cookieStore = await cookies();
  const identity = await resolveRequestIdentity(readSessionCookies(cookieStore));
  if (identity.kind === "member") return {
    isAuthenticated: true, userId: identity.userId,
    role: identity.role === "ADMIN" ? "admin" : "authenticated",
    guestDeviceId: identity.guestDeviceId ?? "", nickname: identity.nickname,
  };
  return { isAuthenticated: false, userId: null, role: "guest", guestDeviceId: identity.kind === "guest" ? identity.guestDeviceId : "" };
}
