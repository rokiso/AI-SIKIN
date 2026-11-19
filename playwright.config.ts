import { defineConfig } from "@playwright/test";
import "dotenv/config";

export default defineConfig({
  testDir: "./tests",
  testMatch: "*.spec.ts",
  fullyParallel: false,
  workers: 2,
  projects: [
    {
      name: "stored-photo",
      testIgnore: ["photo-test-mode.spec.ts", "skin-shop.spec.ts"],
      use: { baseURL: "http://127.0.0.1:3000" },
    },
    {
      name: "preview",
      testMatch: ["photo-test-mode.spec.ts", "skin-shop.spec.ts", "procedures.spec.ts"],
      use: { baseURL: "http://127.0.0.1:3001" },
    },
  ],
  use: {
    baseURL: "http://127.0.0.1:3000",
    headless: true,
    trace: "retain-on-failure",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || "/usr/bin/chromium",
    },
  },
  webServer: [
    {
      command: "npm run start -- --hostname 127.0.0.1",
      // Reserved .invalid endpoint and dummy signing values for UI tests only.
      // GET/PUT requests are intercepted; this never configures a real AWS account.
      env: {
        PORT: "3000",
        PHOTO_TEST_MODE: "0",
        S3_VAULT_BUCKET: "sikin-e2e-storage.invalid",
        S3_VAULT_REGION: "ap-northeast-2",
        S3_ENDPOINT: "https://snapshot-vault.invalid",
        AWS_ACCESS_KEY_ID: "e2e-test-only",
        AWS_SECRET_ACCESS_KEY: "e2e-test-only-not-a-real-credential",
        CATALOG_LIVE_ENABLED: "1",
        ACCOUNT_DELETION_ENABLED: "1",
        CATALOG_AFFILIATE_HOSTS: "shop.example.com",
        PROCEDURE_CATALOG_SOURCE: "database",
      },
      url: "http://127.0.0.1:3000/",
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: "npm run start -- --hostname 127.0.0.1",
      env: {
        PORT: "3001",
        PHOTO_TEST_MODE: "1",
        S3_VAULT_BUCKET: "",
        CATALOG_LIVE_ENABLED: "0",
        ACCOUNT_DELETION_ENABLED: "0",
        PROCEDURE_CATALOG_SOURCE: "published",
      },
      url: "http://127.0.0.1:3001/",
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
