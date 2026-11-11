CREATE TABLE "oauth_attempts" (
  "state_hash" TEXT NOT NULL PRIMARY KEY,
  "expires_at" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "oauth_attempts_expires_at_idx" ON "oauth_attempts"("expires_at");
