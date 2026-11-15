import "dotenv/config";
import { assertLocalDevelopmentDatabase } from "../lib/database-development";
import { getDatabaseUrl } from "../lib/server-env";
import { getPrisma } from "../lib/prisma";
import { checkProductLinks } from "../lib/catalog/linkHealthChecker";
// This workspace CLI cannot mutate an accidentally selected production database.
assertLocalDevelopmentDatabase(getDatabaseUrl());
try {
  console.log(JSON.stringify(await checkProductLinks()));
} finally {
  await getPrisma().$disconnect();
}
