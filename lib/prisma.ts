import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getDatabaseUrl } from "@/lib/server-env";

const globalDatabase = globalThis as typeof globalThis & { sikinPrisma?: PrismaClient };

export function getPrisma(): PrismaClient {
  if (!globalDatabase.sikinPrisma) {
    const adapter = new PrismaPg({
      connectionString: getDatabaseUrl(),
      max: 5,
      connectionTimeoutMillis: 2_000,
      idleTimeoutMillis: 10_000,
      query_timeout: 2_000,
    });
    globalDatabase.sikinPrisma = new PrismaClient({ adapter, log: [] });
  }
  return globalDatabase.sikinPrisma;
}
