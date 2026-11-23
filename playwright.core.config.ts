import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  testMatch: ["core-diagnostic-ttv.spec.ts"],
  workers: 1,
  retries: 0,
  projects: [
    { name: "core-journey", use: { baseURL: "http://localhost:3100", trace: "off", video: "off" } },
  ],
  webServer: [
    {
      command:
        "node --import ./tests/fixtures/core-provider-preload.mjs node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3100",
      url: "http://localhost:3100",
      reuseExistingServer: false,
      timeout: 30000,
      env: {
        CORE_E2E_MOCKS: "1",
        NODE_OPTIONS: "",
        NEXT_PUBLIC_APP_URL: "https://core-app.invalid",
        GOOGLE_CLIENT_ID: "core-e2e-dummy",
        GOOGLE_CLIENT_SECRET: "core-e2e-dummy-secret",
        GOOGLE_REDIRECT_URI: "",
        KAKAO_CLIENT_ID: "",
        KAKAO_CLIENT_SECRET: "",
        PHOTO_TEST_MODE: "0",
        AI_LIVE_ENABLED: "1",
        AI_PROVIDER: "OPENAI",
        AI_API_KEY: "core-e2e-dummy-key",
        AI_MODEL_NAME: "core-mock",
        S3_ENDPOINT: "https://core-vault.invalid",
        S3_VAULT_BUCKET: "sikin-core-test.invalid",
        S3_VAULT_REGION: "ap-northeast-2",
        AWS_ACCESS_KEY_ID: "core-e2e-dummy",
        AWS_SECRET_ACCESS_KEY: "core-e2e-dummy-secret",
        CATALOG_LIVE_ENABLED: "1",
        CATALOG_AFFILIATE_HOSTS: "shop.example.com",
        PROCEDURE_SAFETY_ENABLED: "1",
        PROCEDURE_CATALOG_SOURCE: "published",
        ACCOUNT_DELETION_ENABLED: "0",
        CONSENT_TRUSTED_IP_HEADER: "x-real-ip",
      },
    },
  ],
});
