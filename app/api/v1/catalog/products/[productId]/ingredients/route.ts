import { z } from "zod";
import { NextResponse } from "next/server";
import { AuthError, privateHeaders } from "@/lib/auth/response";
import { catalogFailure, catalogIdentity, parseCatalogQuery } from "@/lib/catalog/http";
import { getProductIngredients } from "@/lib/catalog/ingredient-projection";
import { ingredientQuerySchema, ingredientResponseSchema } from "@/lib/catalog/ingredient-types";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ productId: string }> }) {
  try {
    const { productId } = await context.params;
    if (!z.uuid().safeParse(productId).success)
      throw new AuthError(400, "INVALID_PRODUCT_ID", "상품 식별자를 확인해 주세요.");
    const query = parseCatalogQuery(request, ingredientQuerySchema, "INVALID_INGREDIENT_QUERY");
    const data = await getProductIngredients(productId, query, await catalogIdentity());
    return NextResponse.json(ingredientResponseSchema.parse({ success: true, data }), {
      headers: privateHeaders,
    });
  } catch (error) {
    return catalogFailure(error);
  }
}
