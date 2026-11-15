import { isCatalogPreviewOnly } from "@/lib/server-env";
import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { AuthError, privateHeaders } from "@/lib/auth/response";
import { recordAffiliateRedirect } from "@/lib/catalog/curationService";
import { catalogIdentity, parseCatalogQuery } from "@/lib/catalog/http";
import { redirectQuerySchema } from "@/lib/catalog/types";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    if (isCatalogPreviewOnly())
      throw new AuthError(503, "CATALOG_PREVIEW_ONLY", "구매처 연결을 준비하고 있습니다.");
    const input = parseCatalogQuery(request, redirectQuerySchema, "INVALID_REDIRECT");
    const url = await recordAffiliateRedirect(
      input,
      await catalogIdentity(),
      request.headers.get("user-agent"),
    );
    return NextResponse.redirect(url, {
      status: 302,
      headers: { ...privateHeaders, "Referrer-Policy": "no-referrer" },
    });
  } catch (error) {
    unstable_rethrow(error);
    if (!(error instanceof AuthError)) console.error("[catalog] Affiliate redirect failed");
    // No client-selected return URL and no sensitive request data in the error URL.
    return new NextResponse(null, {
      status: 302,
      headers: {
        ...privateHeaders,
        Location: "/catalog/redirect/error",
        "Referrer-Policy": "no-referrer",
      },
    });
  }
}
