import "dotenv/config";
import { assertLocalDevelopmentDatabase } from "../lib/database-development";
import { getDatabaseUrl } from "../lib/server-env";
import { getPrisma } from "../lib/prisma";
import { seedProcedureGuides } from "../prisma/seeds/procedures";
assertLocalDevelopmentDatabase(getDatabaseUrl());
const prisma = getPrisma();
try {
  const result = await seedProcedureGuides(prisma);
  console.log(
    `Prepared ${result.procedures} local procedure guides; existing price observations were preserved.`,
  );
} finally {
  await prisma.$disconnect();
}
