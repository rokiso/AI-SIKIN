import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { getDatabaseUrl, getOptionalDatabaseUrl } from "@/lib/server-env";
import { assertLocalDevelopmentDatabase } from "@/lib/database-development";

afterEach(() => vi.unstubAllEnvs());

describe("server-only database configuration", () => {
  it("reports missing and invalid configuration without exposing the input", () => {
    vi.stubEnv("DATABASE_URL", "");
    expect(getOptionalDatabaseUrl()).toBeUndefined();
    expect(getDatabaseUrl).toThrow("Database configuration is missing");
    vi.stubEnv("DATABASE_URL", "private-invalid-value");
    expect(getDatabaseUrl).toThrow("Database configuration is invalid");
  });

  it("accepts a PostgreSQL URL for the server while local development mutations stay isolated", () => {
    const local = "postgresql://127.0.0.1:55432/sikin_dev";
    vi.stubEnv("DATABASE_URL", local);
    expect(getDatabaseUrl()).toBe(local);
    expect(() => assertLocalDevelopmentDatabase(local)).not.toThrow();
    for (const value of [
      "postgresql://database.example:55432/sikin_dev",
      "postgresql://127.0.0.1:55432/production",
      "postgresql://127.0.0.1:5432/sikin_dev",
      "postgresql://127.0.0.1:55432/sikin_dev?host=database.example",
      "postgresql://127.0.0.1:55432/sikin_dev?schema=other",
      "https://127.0.0.1:55432/sikin_dev",
    ]) expect(() => assertLocalDevelopmentDatabase(value)).toThrow();
  });
});
