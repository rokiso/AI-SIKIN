import { NextResponse } from "next/server";
import { AuthError, privateHeaders } from "@/lib/auth/response";
import { procedureQuerySchema } from "@/lib/catalog/procedures";
import { getProcedures } from "@/lib/catalog/procedureService";
import { procedureFailure } from "@/lib/catalog/procedure-http";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    const parsed = procedureQuerySchema.safeParse(Object.fromEntries(query));
    if (!parsed.success || [...query.keys()].some((key) => query.getAll(key).length !== 1))
      throw new AuthError(400, "INVALID_PROCEDURE_QUERY", "피부 고민 필터를 확인해 주세요.");
    return NextResponse.json(
      { success: true, data: await getProcedures(parsed.data.concern) },
      { headers: privateHeaders },
    );
  } catch (error) {
    return procedureFailure(error);
  }
}
