import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    await getPrisma().$queryRaw`SELECT 1`;
    return Response.json(
      { success: true, data: { status: "pass", database: "connected", timestamp: new Date().toISOString(), version: "v1" } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    // Deliberately omit driver messages: they may contain connection details.
    console.error("[health] Database readiness check failed");
    return Response.json(
      { success: false, error: { code: "DATABASE_UNAVAILABLE", message: "데이터베이스 연결에 실패했습니다." } },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
