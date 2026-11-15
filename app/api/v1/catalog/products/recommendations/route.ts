import { isCatalogPreviewOnly } from "@/lib/server-env";
import { NextResponse } from "next/server";
import { AuthError, privateHeaders } from "@/lib/auth/response";
import { getProductRecommendations } from "@/lib/catalog/curationService";
import { catalogFailure, catalogIdentity, parseCatalogQuery } from "@/lib/catalog/http";
import { reportQuerySchema } from "@/lib/catalog/types";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    if (isCatalogPreviewOnly())
      throw new AuthError(
        503,
        "CATALOG_PREVIEW_ONLY",
        "현재는 쇼핑 화면 체험 모드입니다. 실제 상품 추천과 구매처 연결을 준비하고 있어요.",
      );
    const { reportId } = parseCatalogQuery(request, reportQuerySchema, "INVALID_REPORT_ID");
    const data = await getProductRecommendations(reportId, await catalogIdentity());
    return NextResponse.json({ success: true, data }, { headers: privateHeaders });
  } catch (error) {
    return catalogFailure(error);
  }
}
