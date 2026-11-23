import "dotenv/config";
import { randomUUID, createHash } from "node:crypto";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { deepStrictEqual } from "node:assert/strict";
import { z } from "zod";
import { getPrisma } from "../../lib/prisma";
import { assertLocalDevelopmentDatabase } from "../../lib/database-development";
import { getDatabaseUrl } from "../../lib/server-env";
import { sampleCatalogProducts } from "../../lib/catalog/sample-data";
import { consentFixture } from "./consent-data";
const [action, path, raw = "{}"] = process.argv.slice(2);
if (!/^\/tmp\/sikin-core-[a-f0-9-]+\.json$/.test(path ?? ""))
  throw Error("Invalid core fixture path");
assertLocalDevelopmentDatabase(getDatabaseUrl());
const db = getPrisma();
const schema = z.object({
  termsId: z.uuid(),
  activeIds: z.array(z.uuid()),
  productIds: z.array(z.uuid()),
  guestIds: z.array(z.uuid()),
  userIds: z.array(z.uuid()),
  otherSessionId: z.uuid(),
  sessions: z.array(z.uuid()),
  snapshots: z.record(z.string(), z.unknown()),
});
try {
  if (action === "initialize") {
    const activeIds = (
      await db.consentTermsVersion.findMany({ where: { isActive: true }, select: { id: true } })
    ).map((x) => x.id);
    const consent = await consentFixture();
    const guest = randomUUID();
    const state = {
      termsId: consent.terms.id,
      activeIds,
      productIds: Array.from({ length: 8 }, () => randomUUID()),
      guestIds: [guest],
      userIds: [],
      sessions: [],
      snapshots: {},
      otherSessionId: randomUUID(),
    };
    await writeFile(path, JSON.stringify(state), { flag: "wx", mode: 0o600 });
    await db.product.createMany({
      data: sampleCatalogProducts.slice(0, 8).map((p, i) => ({
        ...p,
        id: state.productIds[i],
        isActive: true,
        affiliateBaseUrl: "https://shop.example.com/core-fixture",
      })),
    });
    await db.diagnosticSession.create({
      data: {
        id: state.otherSessionId,
        guestDeviceId: guest,
        status: "SURVEY_COMPLETED",
        surveyAnswers: {},
        axisScores: {},
      },
    });
    console.log(JSON.stringify({ otherSessionId: state.otherSessionId }));
  } else {
    const state = schema.parse(JSON.parse(await readFile(path, "utf8")));
    const input = z
      .object({ guestId: z.uuid().optional(), sessionId: z.uuid().optional() })
      .parse(JSON.parse(raw));
    if (action === "track") {
      if (input.guestId) state.guestIds.push(input.guestId);
      if (input.sessionId) state.sessions.push(input.sessionId);
    } else if (action === "capture" || action === "verify") {
      const id = z.uuid().parse(input.sessionId);
      const row = await db.diagnosticSession.findUniqueOrThrow({
        where: { id },
        include: { report: true, uploadSession: true },
      });
      if (action === "capture") {
        state.snapshots[id] = JSON.parse(JSON.stringify(row.report));
        if (row.userId || !row.report || row.uploadSession?.status !== "UPLOADED")
          throw Error("Core guest pipeline did not complete");
      } else {
        if (!row.userId || row.uploadSession?.userId !== row.userId)
          throw Error("Core migration ownership mismatch");
        state.userIds.push(row.userId);
        deepStrictEqual(JSON.parse(JSON.stringify(row.report)), state.snapshots[id]);
        if (
          (await db.diagnosticSession.findUniqueOrThrow({ where: { id: state.otherSessionId } }))
            .userId !== null
        )
          throw Error("Unrelated guest migrated");
        console.log(
          JSON.stringify({ ownerMatched: true, reportPreserved: true, otherGuestUntouched: true }),
        );
      }
    } else if (action === "cleanup") {
      // Resolve owners even if the browser failed immediately after the callback.
      const owners = await db.diagnosticSession.findMany({
        where: { guestDeviceId: { in: state.guestIds } },
        select: { userId: true },
      });
      const userIds = [...state.userIds, ...owners.flatMap((x) => (x.userId ? [x.userId] : []))];
      await db.aiInferenceAuditLog.deleteMany({ where: { sessionId: { in: state.sessions } } });
      await db.oAuthAttempt.deleteMany({
        where: {
          ownerHash: {
            in: state.guestIds.map((id) => createHash("sha256").update(id).digest("base64url")),
          },
        },
      });
      await db.diagnosticSession.deleteMany({ where: { guestDeviceId: { in: state.guestIds } } });
      await db.imageUploadSession.deleteMany({ where: { guestDeviceId: { in: state.guestIds } } });
      await db.userConsentHistory.deleteMany({ where: { termsVersionId: state.termsId } });
      await db.user.deleteMany({ where: { id: { in: userIds } } });
      await db.product.deleteMany({ where: { id: { in: state.productIds } } });
      await db.consentTermsVersion.delete({ where: { id: state.termsId } });
      await db.consentTermsVersion.updateMany({
        where: { id: { in: state.activeIds } },
        data: { isActive: true },
      });
      await unlink(path);
    } else throw Error("Unknown fixture action");
    if (action !== "cleanup") await writeFile(path, JSON.stringify(state), { mode: 0o600 });
  }
} finally {
  await db.$disconnect();
}
