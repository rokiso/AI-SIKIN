CREATE TYPE "LinkHealthStatus" AS ENUM ('HEALTHY', 'UNHEALTHY', 'TIMEOUT', 'REDIRECT_LOOP');
CREATE TYPE "LinkActionTaken" AS ENUM ('NONE', 'SWITCHED_TO_FALLBACK', 'FALLBACK_FAILED', 'MANUAL_ATTENTION_REQUIRED');

CREATE TABLE "affiliate_link_health_logs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "product_id" TEXT NOT NULL,
  "checked_url" TEXT NOT NULL,
  "http_status_code" INTEGER,
  "response_time_ms" INTEGER NOT NULL,
  "status" "LinkHealthStatus" NOT NULL,
  "error_message" TEXT,
  "action_taken" "LinkActionTaken" NOT NULL DEFAULT 'NONE',
  "fallback_product_id" TEXT,
  "checked_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "affiliate_link_health_logs_product_id_checked_at_idx"
  ON "affiliate_link_health_logs" ("product_id", "checked_at");
CREATE INDEX "affiliate_link_health_logs_status_checked_at_idx"
  ON "affiliate_link_health_logs" ("status", "checked_at");

-- One fixed-window quota shared by every deployment instance.
CREATE TABLE "affiliate_link_health_quota" (
  "id" INTEGER PRIMARY KEY CHECK ("id" = 1),
  "minute" INTEGER NOT NULL,
  "request_count" INTEGER NOT NULL CHECK ("request_count" BETWEEN 1 AND 3)
);
