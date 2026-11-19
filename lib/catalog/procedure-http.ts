import "server-only";
import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { AuthError, privateHeaders } from "@/lib/auth/response";
import { procedureFailureMessage } from "./procedures";
import { SafetyRateLimitError } from "./procedure-safety-rate-limit";
export function procedureFailure(error: unknown) {
  unstable_rethrow(error);
  if (error instanceof AuthError)
    return NextResponse.json(
      { success: false, error: { code: error.code, message: error.message } },
      {
        status: error.status,
        headers: {
          ...privateHeaders,
          ...(error instanceof SafetyRateLimitError
            ? { "Retry-After": String(error.retryAfter) }
            : {}),
        },
      },
    );
  console.error("[procedures] Catalog read failed; check database and price observation integrity");
  return NextResponse.json(
    { success: false, error: { code: "PROCEDURES_UNAVAILABLE", message: procedureFailureMessage } },
    { status: 503, headers: privateHeaders },
  );
}
