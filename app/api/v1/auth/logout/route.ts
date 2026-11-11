import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import {
  APP_SESSION_COOKIE_NAME,
  readSessionCookies,
  resolveRequestIdentity,
} from "@/lib/session/identity";
import {
  AuthError,
  authFailure,
  privateHeaders,
  requireSameOrigin,
  sessionCookieOptions,
} from "@/lib/auth/response";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const values = readSessionCookies(await cookies());
    const identity = await resolveRequestIdentity(values);
    if (identity.kind !== "member")
      throw new AuthError(401, "SESSION_REQUIRED", "로그인 상태를 확인해 주세요.");
    await getPrisma().authSession.deleteMany({
      where: { sessionToken: values.sessionToken, userId: identity.userId },
    });
    const response = NextResponse.json(
      { success: true, data: { loggedOut: true } },
      { headers: privateHeaders },
    );
    response.cookies.set(APP_SESSION_COOKIE_NAME, "", { ...sessionCookieOptions, maxAge: 0 });
    return response;
  } catch (error) {
    return authFailure(error);
  }
}
