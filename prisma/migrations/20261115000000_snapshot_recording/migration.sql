CREATE TYPE "SnapshotFeedbackSource" AS ENUM ('GENERAL_GUIDANCE', 'AI');
ALTER TABLE "daily_snapshots" ADD COLUMN "idempotency_key" TEXT,
 ADD COLUMN "etag" TEXT,
 ADD COLUMN "feedback_source" "SnapshotFeedbackSource" NOT NULL DEFAULT 'GENERAL_GUIDANCE';
CREATE UNIQUE INDEX "daily_snapshots_user_id_idempotency_key_key" ON "daily_snapshots"("user_id", "idempotency_key");
CREATE TABLE "snapshot_upload_sessions" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "user_id" TEXT NOT NULL,
 "s3_key" TEXT NOT NULL,
 "mime_type" TEXT NOT NULL,
 "file_size_bytes" INTEGER NOT NULL CHECK ("file_size_bytes" BETWEEN 10240 AND 10485760),
 "record_date" DATE NOT NULL,
 "status" "UploadStatus" NOT NULL DEFAULT 'PENDING',
 "etag" TEXT,
 "expires_at" TIMESTAMPTZ NOT NULL,
 "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "snapshot_upload_sessions_user_id_fkey" FOREIGN KEY("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "snapshot_upload_sessions_s3_key_key" ON "snapshot_upload_sessions"("s3_key");
CREATE INDEX "snapshot_upload_sessions_user_id_created_at_idx" ON "snapshot_upload_sessions"("user_id", "created_at");
CREATE INDEX "snapshot_upload_sessions_status_expires_at_idx" ON "snapshot_upload_sessions"("status", "expires_at");
