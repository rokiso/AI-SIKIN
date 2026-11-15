CREATE TYPE "ProductStatus" AS ENUM ('ACTIVE', 'OUT_OF_STOCK', 'DISCONTINUED', 'UNAVAILABLE');
CREATE TYPE "RecommendationTier" AS ENUM ('PRIMARY', 'SECONDARY');
ALTER TABLE "products"
  ADD COLUMN "key_ingredients" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "full_ingredients" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "thumbnail_url" TEXT,
  ADD COLUMN "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "health_check_fail_count" INTEGER NOT NULL DEFAULT 0 CHECK ("health_check_fail_count" >= 0),
  ADD COLUMN "last_checked_at" TIMESTAMPTZ;
UPDATE "products" SET "key_ingredients" = "ingredients", "full_ingredients" = array_to_string("ingredients", ', ');
ALTER TABLE "product_recommendations"
  ADD COLUMN "tier" "RecommendationTier" NOT NULL DEFAULT 'PRIMARY',
  ADD COLUMN "target_ingredients" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
-- Preserve legacy rows. Refuse ambiguous >2 mappings instead of deleting data.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "product_recommendations" GROUP BY "report_id", "category" HAVING count(*) > 2) THEN
    RAISE EXCEPTION 'Review legacy recommendation groups with more than two products before migrating';
  END IF;
END $$;
WITH ranked AS (
 SELECT r.id, row_number() OVER (PARTITION BY r.report_id, r.category ORDER BY p.is_primary DESC, r.created_at, r.id) AS n
 FROM product_recommendations r JOIN products p ON p.id = r.product_id
)
UPDATE product_recommendations r SET tier = CASE WHEN ranked.n = 1 THEN 'PRIMARY'::"RecommendationTier" ELSE 'SECONDARY'::"RecommendationTier" END FROM ranked WHERE r.id = ranked.id;
CREATE UNIQUE INDEX "product_recommendations_report_id_category_tier_key" ON "product_recommendations"("report_id", "category", "tier");
CREATE TABLE "affiliate_click_logs" (
 "id" TEXT PRIMARY KEY,
 "product_id" TEXT NOT NULL REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "report_id" TEXT,
 "user_id" TEXT,
 "guest_device_id" TEXT,
 "tier" "RecommendationTier" NOT NULL DEFAULT 'PRIMARY',
 "source_baumann_type" VARCHAR(4),
 "target_url" TEXT NOT NULL,
 "user_agent" VARCHAR(512),
 "clicked_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "affiliate_click_logs_product_id_clicked_at_idx" ON "affiliate_click_logs"("product_id", "clicked_at");
CREATE INDEX "affiliate_click_logs_user_id_idx" ON "affiliate_click_logs"("user_id");
CREATE INDEX "affiliate_click_logs_guest_device_id_idx" ON "affiliate_click_logs"("guest_device_id");
