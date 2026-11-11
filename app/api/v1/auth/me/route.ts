import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { readSessionCookies, resolveRequestIdentity } from "@/lib/session/identity";
import { authFailure, privateHeaders } from "@/lib/auth/response";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const identity = await resolveRequestIdentity(readSessionCookies(await cookies()));
    const user =
      identity.kind === "member"
        ? await getPrisma().user.findUnique({
            where: { id: identity.userId },
            select: { id: true, nickname: true, email: true, role: true },
          })
        : null;
    return NextResponse.json(
      { success: true, data: { isAuthenticated: Boolean(user), user } },
      { headers: privateHeaders },
    );
  } catch (error) {
    return authFailure(error);
  }
}
