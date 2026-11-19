import "dotenv/config";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { z } from "zod";
import { getPrisma } from "../../lib/prisma";
import { getDatabaseUrl } from "../../lib/server-env";
import { assertLocalDevelopmentDatabase } from "../../lib/database-development";
import { safetyQuestionSchema } from "../../lib/catalog/procedure-safety-types";
const [action, path] = process.argv.slice(2);
if (!/^\/tmp\/sikin-procedure-safety-[a-f0-9-]+\.json$/.test(path ?? ""))
  throw Error("Invalid local fixture path");
assertLocalDevelopmentDatabase(getDatabaseUrl());
const db = getPrisma();
try {
  if (action === "empty") {
    const row = await db.procedureSafetyGuide.findUniqueOrThrow({ where: { slug: "pico-toning" } });
    await writeFile(
      path,
      JSON.stringify({
        id: row.id,
        defenseQuestions: row.defenseQuestions,
        updatedAt: row.updatedAt.toISOString(),
      }),
      { flag: "wx", mode: 0o600 },
    );
    await db.procedureSafetyGuide.update({ where: { id: row.id }, data: { defenseQuestions: [] } });
  } else if (action === "restore") {
    const state = z
      .object({
        id: z.uuid(),
        defenseQuestions: z.array(safetyQuestionSchema),
        updatedAt: z.iso.datetime(),
      })
      .parse(JSON.parse(await readFile(path, "utf8")));
    await db.procedureSafetyGuide.update({
      where: { id: state.id },
      data: { defenseQuestions: state.defenseQuestions, updatedAt: new Date(state.updatedAt) },
    });
    await unlink(path);
  } else throw Error("Unknown fixture action");
  console.log("Local safety fixture updated");
} finally {
  await db.$disconnect();
}
