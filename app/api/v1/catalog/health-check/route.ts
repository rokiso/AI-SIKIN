import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { AuthError, privateHeaders, smallJson } from "@/lib/auth/response";
import { checkProductLinks } from "@/lib/catalog/affiliate-health-batch";
import { getPrisma } from "@/lib/prisma";
import { getCatalogCronSecret } from "@/lib/server-env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const inputSchema = z
  .object({ dryRun: z.boolean().optional(), targetProductId: z.uuid().optional() })
  .strict();
const hash = (value: string) => createHash("sha256").update(value).digest();

function failure(
  status: number,
  code: string,
  message: string,
  headers: HeadersInit = privateHeaders,
) {
  return Response.json({ success: false, error: { code, message } }, { status, headers });
}

export async function POST(request: Request) {
  const secret = getCatalogCronSecret();
  const bearer = request.headers.get("authorization") ?? "";
  if (!secret || !timingSafeEqual(hash(bearer), hash(`Bearer ${secret}`)))
    return failure(
      401,
      "UNAUTHORIZED_CRON_REQUEST",
      "유효한 시스템 인증 토큰이 제공되지 않았습니다.",
    );

  try {
    const input = inputSchema.safeParse(request.body ? await smallJson(request) : {});
    if (!input.success)
      return failure(400, "INVALID_HEALTH_CHECK_REQUEST", "점검 요청 내용을 확인해 주세요.");

    const now = Date.now();
    const minute = Math.floor(now / 60_000);
    const [quota] = await getPrisma().$queryRaw<{ request_count: number }[]>`
      INSERT INTO affiliate_link_health_quota (id, minute, request_count) VALUES (1, ${minute}::int, 1)
      ON CONFLICT (id) DO UPDATE SET
        request_count = CASE
          WHEN affiliate_link_health_quota.minute < EXCLUDED.minute THEN 1
          ELSE LEAST(affiliate_link_health_quota.request_count + 1, 3)
        END,
        minute = GREATEST(affiliate_link_health_quota.minute, EXCLUDED.minute)
      RETURNING request_count`;
    if (quota.request_count > 2)
      return failure(429, "HEALTH_CHECK_RATE_LIMITED", "잠시 후 링크 점검을 다시 요청해 주세요.", {
        ...privateHeaders,
        "Retry-After": String(Math.ceil(((minute + 1) * 60_000 - now) / 1000)),
      });

    const data = await checkProductLinks(input.data);
    if (!data.checkedCount && data.failedCount) throw new Error("All product health checks failed");
    return Response.json({ success: true, data }, { headers: privateHeaders });
  } catch (error) {
    if (error instanceof AuthError)
      return failure(400, "INVALID_HEALTH_CHECK_REQUEST", "점검 요청 내용을 확인해 주세요.");
    console.error("[affiliate-health] Batch failed");
    return failure(
      500,
      "HEALTH_CHECK_BATCH_FAILED",
      "제휴 링크 헬스체크 배치 처리 중 서버 오류가 발생했습니다.",
    );
  }
}
