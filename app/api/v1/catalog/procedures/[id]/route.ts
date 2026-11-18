import { z } from "zod";
import { NextResponse } from "next/server";
import { AuthError, privateHeaders } from "@/lib/auth/response";
import { getProcedure } from "@/lib/catalog/procedureService";
import { procedureFailure } from "@/lib/catalog/procedure-http";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (new URL(request.url).search)
      throw new AuthError(400, "INVALID_PROCEDURE_QUERY", "요청 내용을 확인해 주세요.");
    const parsed = z.uuid().safeParse((await context.params).id);
    const procedure = parsed.success ? await getProcedure(parsed.data) : null;
    if (!procedure)
      throw new AuthError(404, "PROCEDURE_NOT_FOUND", "해당 시술 정보가 존재하지 않습니다.");
    return NextResponse.json({ success: true, data: { procedure } }, { headers: privateHeaders });
  } catch (error) {
    return procedureFailure(error);
  }
}
