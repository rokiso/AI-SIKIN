ALTER TABLE "diagnostic_reports"
  ADD COLUMN "is_fallback" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "fallback_reason" TEXT;
