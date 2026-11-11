ALTER TABLE "oauth_attempts" ADD COLUMN "owner_hash" TEXT;
CREATE INDEX "oauth_attempts_owner_hash_expires_at_idx" ON "oauth_attempts"("owner_hash", "expires_at");
