import "dotenv/config";
import { spawnSync } from "node:child_process";
import { getDatabaseUrl } from "../lib/server-env";
import { assertLocalDevelopmentDatabase } from "../lib/database-development";

const action = process.argv[2];
const supported = new Map<string, string[]>([
  ["generate", ["generate"]],
  ["validate", ["validate"]],
  ["format", ["format"]],
  ["migrate", ["migrate", "deploy"]],
  ["status", ["migrate", "status"]],
]);

if (action === "seed") {
  assertLocalDevelopmentDatabase(getDatabaseUrl());
  if (process.env.ALLOW_SAMPLE_SEED !== "true")
    throw new Error(
      "Sample seeding requires ALLOW_SAMPLE_SEED=true and an isolated local database",
    );
  const { getPrisma } = await import("../lib/prisma");
  const { seedSampleCatalog } = await import("../prisma/seed");
  const prisma = getPrisma();
  try {
    await seedSampleCatalog(prisma);
    console.log("Inactive development catalog fixtures prepared.");
  } finally {
    await prisma.$disconnect();
  }
} else {
  if (!action || !supported.has(action)) throw new Error("Unknown database command");
  if (action === "migrate" || action === "status") assertLocalDevelopmentDatabase(getDatabaseUrl());
  const args = supported.get(action);
  if (!args) throw new Error("Unknown database command");
  const result = spawnSync(
    process.execPath,
    ["--conditions=react-server", "node_modules/prisma/build/index.js", ...args],
    { stdio: "inherit", env: process.env },
  );
  process.exitCode = result.status ?? 1;
}
