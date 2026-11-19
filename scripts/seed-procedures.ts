import "dotenv/config";
import { assertLocalDevelopmentDatabase } from "../lib/database-development";
import { getDatabaseUrl } from "../lib/server-env";
import { getPrisma } from "../lib/prisma";
import { seedProcedureGuides } from "../prisma/seeds/procedures";
import { seedProcedureSafetyGuides } from "../prisma/seeds/procedure-safety";
assertLocalDevelopmentDatabase(getDatabaseUrl());
const prisma = getPrisma();
try {
  const result = await seedProcedureGuides(prisma);
  const safety = await seedProcedureSafetyGuides(prisma);
  console.log(
    `Prepared ${result.procedures} local procedure guides and ${safety.guides} safety guides; existing records and price observations were preserved.`,
  );
} finally {
  await prisma.$disconnect();
}
