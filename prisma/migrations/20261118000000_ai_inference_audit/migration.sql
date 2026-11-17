CREATE TYPE "AiInferenceStatus" AS ENUM ('SUCCESS', 'TIMEOUT', 'ERROR');
CREATE TABLE "ai_inference_audit_logs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "session_id" TEXT,
  "provider" TEXT NOT NULL CHECK ("provider" IN ('OPENAI', 'GEMINI')),
  "model_name" TEXT NOT NULL,
  "prompt_template_hash" TEXT NOT NULL CHECK ("prompt_template_hash" ~ '^[a-f0-9]{64}$'),
  "latency_ms" INTEGER NOT NULL CHECK ("latency_ms" >= 0),
  "prompt_tokens" INTEGER CHECK ("prompt_tokens" >= 0),
  "completion_tokens" INTEGER CHECK ("completion_tokens" >= 0),
  "total_tokens" INTEGER CHECK ("total_tokens" >= 0),
  "status" "AiInferenceStatus" NOT NULL,
  "error_message" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_audit_error_code" CHECK ("error_message" IS NULL OR "error_message" IN (
    'AI_GATEWAY_TIMEOUT', 'AI_PROVIDER_ERROR', 'AI_INVALID_RESPONSE', 'AI_UNSAFE_RESPONSE',
    'AI_INVALID_IMAGE', 'AI_INVALID_REQUEST', 'AI_DISABLED', 'AI_CONFIGURATION_UNAVAILABLE'
  ))
);
CREATE INDEX "ai_inference_audit_logs_session_id_idx" ON "ai_inference_audit_logs"("session_id");
CREATE INDEX "ai_inference_audit_logs_status_created_at_idx" ON "ai_inference_audit_logs"("status", "created_at");
