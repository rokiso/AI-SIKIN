-- Hand-authored from schema.prisma while the Prisma engine download is blocked.
-- Apply through Prisma migrate only; no migration history is fabricated.

CREATE TYPE "UserRole" AS ENUM ('GUEST', 'USER', 'ADMIN');
CREATE TYPE "AuthProvider" AS ENUM ('KAKAO', 'GOOGLE');
CREATE TYPE "UploadStatus" AS ENUM ('PENDING', 'UPLOADED', 'EXPIRED', 'FAILED');
CREATE TYPE "DiagnosticSessionStatus" AS ENUM ('SURVEY_COMPLETED', 'ANALYSIS_PENDING', 'COMPLETED', 'FAILED');
CREATE TYPE "ProductCategory" AS ENUM ('TONER', 'SERUM', 'CREAM', 'SUNCARE');
CREATE TYPE "SkinConditionLevel" AS ENUM ('LOW', 'BALANCED', 'HIGH');

CREATE TABLE "users" (
  "id" TEXT NOT NULL,
  "email" TEXT,
  "nickname" TEXT NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'USER',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_accounts" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "provider" "AuthProvider" NOT NULL,
  "provider_account_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "auth_sessions" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "session_token" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_consent_histories" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "sensitive_agreed" BOOLEAN NOT NULL,
  "terms_version" TEXT NOT NULL,
  "ip_address" TEXT,
  "agreed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_consent_histories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "image_upload_sessions" (
  "id" TEXT NOT NULL,
  "guest_device_id" TEXT,
  "user_id" TEXT,
  "s3_key" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "file_size_bytes" INTEGER NOT NULL,
  "etag" TEXT,
  "status" "UploadStatus" NOT NULL DEFAULT 'PENDING',
  "expires_at" TIMESTAMPTZ NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "image_upload_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "diagnostic_sessions" (
  "id" TEXT NOT NULL,
  "guest_device_id" TEXT,
  "user_id" TEXT,
  "upload_session_id" TEXT,
  "status" "DiagnosticSessionStatus" NOT NULL DEFAULT 'SURVEY_COMPLETED',
  "survey_answers" JSONB NOT NULL,
  "axis_scores" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "diagnostic_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "diagnostic_reports" (
  "id" TEXT NOT NULL,
  "session_id" TEXT NOT NULL,
  "baumann_type" TEXT NOT NULL,
  "oiliness_score" INTEGER NOT NULL,
  "sensitivity_score" INTEGER NOT NULL,
  "pigmentation_score" INTEGER NOT NULL,
  "elasticity_score" INTEGER NOT NULL,
  "summary_text" TEXT NOT NULL,
  "ai_audit_metadata" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "diagnostic_reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "products" (
  "id" TEXT NOT NULL,
  "brand" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" "ProductCategory" NOT NULL,
  "ingredients" TEXT[],
  "target_types" TEXT[],
  "is_primary" BOOLEAN NOT NULL DEFAULT true,
  "affiliate_url" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_recommendations" (
  "id" TEXT NOT NULL,
  "report_id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "category" "ProductCategory" NOT NULL,
  "match_reason" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_recommendations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "medical_procedures" (
  "id" TEXT NOT NULL,
  "name_ko" TEXT NOT NULL,
  "principle_text" TEXT NOT NULL,
  "recommended_interval" TEXT NOT NULL,
  "side_effects" TEXT[],
  "min_price_krw" INTEGER NOT NULL,
  "max_price_krw" INTEGER NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "medical_procedures_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "procedure_guide_mappings" (
  "id" TEXT NOT NULL,
  "report_id" TEXT NOT NULL,
  "procedure_id" TEXT NOT NULL,
  "concern_type" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "procedure_guide_mappings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "daily_snapshots" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "s3_key" TEXT NOT NULL,
  "record_date" DATE NOT NULL,
  "feedback_comment" TEXT NOT NULL,
  "hydration_level" "SkinConditionLevel" NOT NULL DEFAULT 'BALANCED',
  "soothing_level" "SkinConditionLevel" NOT NULL DEFAULT 'BALANCED',
  "sebum_level" "SkinConditionLevel" NOT NULL DEFAULT 'BALANCED',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "daily_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users" ("email");
CREATE UNIQUE INDEX "user_accounts_provider_provider_account_id_key" ON "user_accounts" ("provider", "provider_account_id");
CREATE INDEX "user_accounts_user_id_idx" ON "user_accounts" ("user_id");
CREATE UNIQUE INDEX "auth_sessions_session_token_key" ON "auth_sessions" ("session_token");
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions" ("user_id");
CREATE INDEX "auth_sessions_session_token_idx" ON "auth_sessions" ("session_token");
CREATE UNIQUE INDEX "user_consent_histories_user_id_key" ON "user_consent_histories" ("user_id");
CREATE UNIQUE INDEX "image_upload_sessions_s3_key_key" ON "image_upload_sessions" ("s3_key");
CREATE INDEX "image_upload_sessions_guest_device_id_idx" ON "image_upload_sessions" ("guest_device_id");
CREATE INDEX "image_upload_sessions_user_id_idx" ON "image_upload_sessions" ("user_id");
CREATE INDEX "image_upload_sessions_status_expires_at_idx" ON "image_upload_sessions" ("status", "expires_at");
CREATE INDEX "diagnostic_sessions_guest_device_id_idx" ON "diagnostic_sessions" ("guest_device_id");
CREATE INDEX "diagnostic_sessions_user_id_idx" ON "diagnostic_sessions" ("user_id");
CREATE INDEX "diagnostic_sessions_status_idx" ON "diagnostic_sessions" ("status");
CREATE INDEX "diagnostic_sessions_upload_session_id_idx" ON "diagnostic_sessions" ("upload_session_id");
CREATE UNIQUE INDEX "diagnostic_reports_session_id_key" ON "diagnostic_reports" ("session_id");
CREATE INDEX "diagnostic_reports_baumann_type_idx" ON "diagnostic_reports" ("baumann_type");
CREATE INDEX "products_category_is_active_idx" ON "products" ("category", "is_active");
CREATE INDEX "product_recommendations_report_id_idx" ON "product_recommendations" ("report_id");
CREATE INDEX "product_recommendations_product_id_idx" ON "product_recommendations" ("product_id");
CREATE INDEX "procedure_guide_mappings_report_id_idx" ON "procedure_guide_mappings" ("report_id");
CREATE INDEX "procedure_guide_mappings_procedure_id_idx" ON "procedure_guide_mappings" ("procedure_id");
CREATE UNIQUE INDEX "daily_snapshots_user_id_record_date_key" ON "daily_snapshots" ("user_id", "record_date");
CREATE INDEX "daily_snapshots_user_id_record_date_idx" ON "daily_snapshots" ("user_id", "record_date");

ALTER TABLE "user_accounts" ADD CONSTRAINT "user_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_consent_histories" ADD CONSTRAINT "user_consent_histories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "image_upload_sessions" ADD CONSTRAINT "image_upload_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "diagnostic_sessions" ADD CONSTRAINT "diagnostic_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "diagnostic_sessions" ADD CONSTRAINT "diagnostic_sessions_upload_session_id_fkey" FOREIGN KEY ("upload_session_id") REFERENCES "image_upload_sessions" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "diagnostic_reports" ADD CONSTRAINT "diagnostic_reports_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "diagnostic_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_recommendations" ADD CONSTRAINT "product_recommendations_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "diagnostic_reports" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_recommendations" ADD CONSTRAINT "product_recommendations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "procedure_guide_mappings" ADD CONSTRAINT "procedure_guide_mappings_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "diagnostic_reports" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "procedure_guide_mappings" ADD CONSTRAINT "procedure_guide_mappings_procedure_id_fkey" FOREIGN KEY ("procedure_id") REFERENCES "medical_procedures" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "daily_snapshots" ADD CONSTRAINT "daily_snapshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Domain invariants from the master spec. The application server is the only
-- access path; no browser or anonymous database grants are introduced here.
ALTER TABLE "diagnostic_reports"
  ADD CONSTRAINT "diagnostic_reports_baumann_type_check"
    CHECK ("baumann_type" ~ '^[OD][SR][PN][WT]$'),
  ADD CONSTRAINT "diagnostic_reports_axis_scores_check"
    CHECK ("oiliness_score" BETWEEN 0 AND 100
      AND "sensitivity_score" BETWEEN 0 AND 100
      AND "pigmentation_score" BETWEEN 0 AND 100
      AND "elasticity_score" BETWEEN 0 AND 100);

ALTER TABLE "products"
  ADD CONSTRAINT "products_target_types_check"
    CHECK (array_position("target_types", NULL) IS NULL
      AND "target_types" <@ ARRAY[
        'OSPW', 'OSPT', 'OSNW', 'OSNT', 'ORPW', 'ORPT', 'ORNW', 'ORNT',
        'DSPW', 'DSPT', 'DSNW', 'DSNT', 'DRPW', 'DRPT', 'DRNW', 'DRNT'
      ]::TEXT[]);

ALTER TABLE "medical_procedures"
  ADD CONSTRAINT "medical_procedures_price_range_check"
    CHECK ("min_price_krw" >= 0 AND "max_price_krw" >= "min_price_krw");

ALTER TABLE "image_upload_sessions"
  ADD CONSTRAINT "image_upload_sessions_file_size_check"
    CHECK ("file_size_bytes" > 0);

CREATE FUNCTION "reject_diagnostic_report_update"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'Diagnostic reports are immutable'
    USING ERRCODE = '23514', CONSTRAINT = 'diagnostic_reports_immutable';
END;
$$;

CREATE TRIGGER "diagnostic_reports_immutable"
  BEFORE UPDATE ON "diagnostic_reports"
  FOR EACH ROW EXECUTE FUNCTION "reject_diagnostic_report_update"();

CREATE FUNCTION "reject_survey_answers_update"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW."survey_answers" IS DISTINCT FROM OLD."survey_answers" THEN
    RAISE EXCEPTION 'Original survey answers are immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'diagnostic_session_answers_immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "diagnostic_session_answers_immutable"
  BEFORE UPDATE ON "diagnostic_sessions"
  FOR EACH ROW EXECUTE FUNCTION "reject_survey_answers_update"();
