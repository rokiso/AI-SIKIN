CREATE TABLE "procedure_safety_guides" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "procedure_id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "common_side_effects" TEXT[] NOT NULL,
  "rare_risks" TEXT[] NOT NULL,
  "contraindications" TEXT[] NOT NULL,
  "post_care_instructions" TEXT[] NOT NULL,
  "defense_questions" JSONB NOT NULL,
  "disclaimer_text" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "procedure_safety_guides_procedure_id_fkey" FOREIGN KEY ("procedure_id") REFERENCES "medical_procedures"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "procedure_safety_guides_procedure_id_key" ON "procedure_safety_guides"("procedure_id");
CREATE UNIQUE INDEX "procedure_safety_guides_slug_key" ON "procedure_safety_guides"("slug");
CREATE TABLE "procedure_safety_rate_limits" (
  "key_hash" TEXT NOT NULL PRIMARY KEY,
  "request_count" INTEGER NOT NULL CHECK ("request_count" BETWEEN 1 AND 121),
  "expires_at" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "procedure_safety_rate_limits_expires_at_idx" ON "procedure_safety_rate_limits"("expires_at");
