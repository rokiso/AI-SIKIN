import "dotenv/config";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { getDatabaseUrl } from "../lib/server-env";
import { assertLocalDevelopmentDatabase } from "../lib/database-development";
import { getPrisma } from "../lib/prisma";
import { summarizeProcedurePriceOptions } from "../lib/catalog/procedure-pricing";

// Validate and preview first. This command never connects to a remote database.
const args = process.argv.slice(2);
if (args.length < 1 || args.length > 2 || (args[1] && args[1] !== "--apply"))
  throw new Error("Usage: npm run procedures:prices -- <json-file> [--apply]");
assertLocalDevelopmentDatabase(getDatabaseUrl());
const input = z
  .object({
    code: z.string().regex(/^P-[A-Z]+$/),
    basis: z.string().trim().min(1).max(200),
    observations: z.array(z.json()).min(1).max(500),
  })
  .strict()
  .parse(JSON.parse(await readFile(args[0], "utf8")));
const summary = summarizeProcedurePriceOptions(input.observations, input.basis);
console.log(JSON.stringify({ code: input.code, ...summary }, null, 2));
if (args[1] === "--apply") {
  const prisma = getPrisma();
  try {
    await prisma.medicalProcedure.update({
      where: { code: input.code },
      data: {
        priceBasis: input.basis,
        priceObservations: input.observations,
      },
    });
    console.log("Local price observations saved. Catalog cache refreshes within 30 seconds.");
  } finally {
    await prisma.$disconnect();
  }
} else console.log("Preview only. No database changes.");
