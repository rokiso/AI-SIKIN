import type { ProductRecommendationResponse } from "@/lib/catalog/types";
import { SkinShop } from "./SkinShop";
export function ProductRecommendationSection({ data }: { data: ProductRecommendationResponse }) {
  return <SkinShop data={data} />;
}
