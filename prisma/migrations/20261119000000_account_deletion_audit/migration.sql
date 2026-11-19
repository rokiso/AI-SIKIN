CREATE TABLE "deletion_audit_logs" (
    "id" TEXT NOT NULL,
    "user_hash" TEXT NOT NULL,
    "deleted_images_count" INTEGER NOT NULL CHECK ("deleted_images_count" >= 0),
    "deleted_records_count" INTEGER NOT NULL CHECK ("deleted_records_count" >= 0),
    "completed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "deletion_audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "deletion_audit_logs_user_hash_idx" ON "deletion_audit_logs"("user_hash");
