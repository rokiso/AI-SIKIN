import "dotenv/config";
import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  inspectProductManifest,
  importInactiveAffiliateProducts,
  ProductManifestError,
} from "../lib/catalog/product-import";
import { getPrisma } from "../lib/prisma";
import { getDatabaseUrl } from "../lib/server-env";
import { assertLocalDevelopmentDatabase } from "../lib/database-development";
const args = process.argv.slice(2);
if (args.length < 1 || args.length > 2 || (args[1] && args[1] !== "--apply"))
  throw Error("Usage: npm run products:import -- <json-file> [--apply]");
let db: ReturnType<typeof getPrisma> | undefined;
try {
  if ((await stat(args[0])).size > 4 * 1024 * 1024) throw Error("File too large");
  const bytes = await readFile(args[0]);
  const input: unknown = JSON.parse(bytes.toString("utf8"));
  const { summary } = inspectProductManifest(input);
  const digest = createHash("sha256").update(bytes).digest("hex");
  console.log(JSON.stringify({ manifestSha256: digest, ...summary }, null, 2));
  if (args[1] === "--apply") {
    assertLocalDevelopmentDatabase(getDatabaseUrl());
    db = getPrisma();
    console.log(JSON.stringify(await importInactiveAffiliateProducts(db, input)));
  } else console.log("Preview only. No DB access, link probing or live activation.");
  if (!summary.readyForLocalImport) process.exitCode = 1;
} catch (error) {
  console.error(
    JSON.stringify({
      success: false,
      code: error instanceof ProductManifestError ? error.code : "PRODUCT_IMPORT_FAILED",
      message:
        "Product setup failed. Check the file, approved configuration and isolated local database; no live activation occurred.",
    }),
  );
  process.exitCode = 1;
} finally {
  if (db) await db.$disconnect();
}
