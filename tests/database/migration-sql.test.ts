// @vitest-environment node
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { expect, it } from "vitest";
import { getDatabaseUrl } from "../../lib/server-env";
import { assertLocalDevelopmentDatabase } from "../../lib/database-development";

it("PostgreSQL accepts the initial migration and all twelve tables inside an isolated rollback-only schema", async () => {
  const connectionString = getDatabaseUrl();
  assertLocalDevelopmentDatabase(connectionString);
  const connection = new Client({ connectionString, connectionTimeoutMillis: 2_000 });
  const schema = `sikin_sqlcheck_${randomUUID().replaceAll("-", "")}`;
  const sql = await readFile(new URL("../../prisma/migrations/20261110000000_init_core_schema/migration.sql", import.meta.url), "utf8");
  await connection.connect();
  try {
    await connection.query("BEGIN");
    // The identifier is exclusively generated from randomUUID, never supplied by a caller.
    await connection.query(`CREATE SCHEMA "${schema}"`);
    await connection.query(`SET LOCAL search_path TO "${schema}"`);
    await connection.query(sql);
    const tables = await connection.query<{ table_name: string }>("SELECT table_name FROM information_schema.tables WHERE table_schema = $1", [schema]);
    expect(tables.rows.map((table) => table.table_name).sort()).toEqual([
      "auth_sessions", "daily_snapshots", "diagnostic_reports", "diagnostic_sessions",
      "image_upload_sessions", "medical_procedures", "procedure_guide_mappings", "product_recommendations",
      "products", "user_accounts", "user_consent_histories", "users",
    ]);
    const checks = await connection.query<{ count: string }>("SELECT count(*) FROM pg_constraint WHERE contype = 'c' AND connamespace = $1::regnamespace", [schema]);
    expect(Number(checks.rows[0]?.count)).toBe(5);
  } finally {
    // This validates SQL only; it never stamps Prisma migration history or changes real data.
    await connection.query("ROLLBACK");
    await connection.end();
  }
});
