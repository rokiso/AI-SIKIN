import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import {
  AuthError,
  privateHeaders,
  requireSameOrigin,
  sessionCookieOptions,
  smallJson,
} from "@/lib/auth/response";
import {
  readSessionCookies,
  resolveRequestIdentity,
  APP_SESSION_COOKIE_NAME,
} from "@/lib/session/identity";
import { GUEST_COOKIE_NAME } from "@/lib/session/guest";
import { GUEST_PROOF_COOKIE_NAME } from "@/lib/session/guest-proof";
import { MIGRATION_NOTICE_COOKIE } from "@/lib/auth/migration-notice";
import { deleteAccount, deletionConfirmationSchema } from "@/lib/account/deletion";
import { OAUTH_COOKIE } from "@/lib/auth/pkce";
import { getPrisma } from "@/lib/prisma";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function DELETE(request: Request) {
  try {
    requireSameOrigin(request);
    const values = readSessionCookies(await cookies());
    const identity = await resolveRequestIdentity(values);
    if (identity.kind !== "member" || !values.sessionToken)
      throw new AuthError(401, "UNAUTHORIZED", "인증 세션이 유효하지 않습니다.");
    const input = deletionConfirmationSchema.safeParse(await smallJson(request));
    if (!input.success)
      throw new AuthError(
        400,
        "INVALID_CONFIRMATION",
        "탈퇴 확인 문구가 일치하지 않거나 동의가 완료되지 않았습니다.",
      );
    const data = await deleteAccount(identity.userId, values.sessionToken);
    const response = NextResponse.json({ success: true, data }, { headers: privateHeaders });
    for (const name of [
      APP_SESSION_COOKIE_NAME,
      GUEST_COOKIE_NAME,
      GUEST_PROOF_COOKIE_NAME,
      MIGRATION_NOTICE_COOKIE,
      OAUTH_COOKIE,
    ])
      response.cookies.set(name, "", { ...sessionCookieOptions, maxAge: 0 });
    return response;
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof AuthError)
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.status, headers: privateHeaders },
      );
    console.error("[account-deletion] Transaction failed; deletion not completed");
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "ACCOUNT_DELETION_FAILED",
          message:
            "회원 탈퇴를 완료하지 못했습니다. 일부 사진은 이미 삭제되었을 수 있습니다. 잠시 후 다시 시도해 주세요.",
        },
      },
      { status: 503, headers: privateHeaders },
    );
  }
}

export async function GET() {
  try {
    const identity = await resolveRequestIdentity(readSessionCookies(await cookies()));
    if (identity.kind !== "member")
      throw new AuthError(401, "UNAUTHORIZED", "인증 세션이 유효하지 않습니다.");
    const [diagnostics, snapshots] = await Promise.all([
      getPrisma().diagnosticSession.count({ where: { userId: identity.userId } }),
      getPrisma().dailySnapshot.count({ where: { userId: identity.userId } }),
    ]);
    return NextResponse.json(
      { success: true, data: { diagnostics, snapshots } },
      { headers: privateHeaders },
    );
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof AuthError)
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.status, headers: privateHeaders },
      );
    console.error("[account-deletion] Summary unavailable");
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "DELETION_SUMMARY_UNAVAILABLE",
          message: "삭제할 기록 수를 확인하지 못했습니다. 다시 시도해 주세요.",
        },
      },
      { status: 503, headers: privateHeaders },
    );
  }
}
