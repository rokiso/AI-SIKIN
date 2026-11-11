import "dotenv/config";
import { defineConfig } from "prisma/config";
// Prisma loads this CLI-only file with its own module loader. Runtime app
// credentials are validated exclusively by the server-only lib/server-env.ts.
const url = process.env.DATABASE_URL;
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  ...(url ? { datasource: { url } } : {}),
});
