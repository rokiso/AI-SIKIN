import "dotenv/config";
import { assertLocalDevelopmentDatabase } from "../lib/database-development";
import { getDatabaseUrl } from "../lib/server-env";
import { getPrisma } from "../lib/prisma";
import { expireStaleSessions } from "../lib/diagnostic/upload-session";

// Keep the existing workspace CLI convention: never mutate a remote database.
assertLocalDevelopmentDatabase(getDatabaseUrl());
const apply = process.argv.slice(2);
if (apply.length > 1 || (apply.length === 1 && apply[0] !== "--apply")) {
  throw new Error("Usage: npm run uploads:expire -- [--apply]");
}
try {
  const now = new Date();
  if (apply[0] === "--apply")
    console.log(JSON.stringify({ applied: true, ...(await expireStaleSessions(now)) }));
  else
    console.log(
      JSON.stringify({
        applied: false,
        eligibleCount: await getPrisma().imageUploadSession.count({
          where: { status: "PENDING", expiresAt: { lte: now } },
        }),
      }),
    );
} finally {
  await getPrisma().$disconnect();
}
