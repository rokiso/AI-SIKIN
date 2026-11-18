import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { getPrisma } from "@/lib/prisma";
import { getDatabaseUrl } from "@/lib/server-env";
import { assertLocalDevelopmentDatabase } from "@/lib/database-development";
import { transferConsentOwnership } from "@/lib/consent/service";
const db = getPrisma();
beforeAll(() => assertLocalDevelopmentDatabase(getDatabaseUrl()));
afterAll(() => db.$disconnect());
it("does not query nonexistent guest consent columns on a legacy schema", async () => {
  const rollback = new Error("ROLLBACK_LEGACY_SCHEMA_TEST");
  await expect(
    db.$transaction(async (tx) => {
      // Transactional DDL rolls back completely; no shared fixture data is overwritten.
      await tx.$executeRawUnsafe(
        'ALTER TABLE "user_consent_histories" RENAME COLUMN "guest_device_id" TO "legacy_schema_test_guest_id"',
      );
      expect(await transferConsentOwnership(tx, randomUUID(), randomUUID())).toEqual({ count: 0 });
      throw rollback;
    }),
  ).rejects.toBe(rollback);
  const columns = await db.$queryRaw<
    Array<{ ready: boolean }>
  >`SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_consent_histories' AND column_name='guest_device_id') AS ready`;
  expect(columns[0].ready).toBe(true);
});
