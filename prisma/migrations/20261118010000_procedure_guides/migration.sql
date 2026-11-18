-- Extend the existing catalog without replacing report mappings or legacy rows.
CREATE TYPE "SkinConcernType" AS ENUM ('ACNE_SCAR', 'PIGMENTATION', 'PORE_SEBUM', 'ELASTICITY', 'BARRIER_REDNESS');
ALTER TABLE "medical_procedures"
  ALTER COLUMN "min_price_krw" DROP NOT NULL,
  ALTER COLUMN "max_price_krw" DROP NOT NULL,
  ADD COLUMN "code" TEXT,
  ADD COLUMN "aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "concern_type" "SkinConcernType",
  ADD COLUMN "recovery_period" TEXT,
  ADD COLUMN "checklist_questions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "price_basis" TEXT,
  ADD COLUMN "price_observations" JSONB NOT NULL DEFAULT '[]';
CREATE UNIQUE INDEX "medical_procedures_code_key" ON "medical_procedures"("code");
CREATE INDEX "medical_procedures_concern_type_is_active_idx" ON "medical_procedures"("concern_type", "is_active");
CREATE INDEX "medical_procedures_sort_order_idx" ON "medical_procedures"("sort_order");
-- No event prices or purported market averages are inserted by a migration.
