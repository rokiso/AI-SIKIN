import { NextResponse } from "next/server";
import { privateHeaders } from "@/lib/auth/response";
import { getProductRecommendations } from "@/lib/catalog/curationService";
import { catalogFailure, catalogIdentity, parseCatalogQuery } from "@/lib/catalog/http";
import { reportQuerySchema } from "@/lib/catalog/types";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const { reportId } = parseCatalogQuery(request, reportQuerySchema, "INVALID_REPORT_ID");
    const data = await getProductRecommendations(reportId, await catalogIdentity());
    return NextResponse.json({ success: true, data }, { headers: privateHeaders });
  } catch (error) {
    return catalogFailure(error);
  }
}
