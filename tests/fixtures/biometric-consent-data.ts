import "dotenv/config";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getPrisma } from "../../lib/prisma";
import { assertLocalDevelopmentDatabase } from "../../lib/database-development";
import { getDatabaseUrl } from "../../lib/server-env";
import { createGuestSession } from "../../lib/session/guest-proof";
import { consentFixture } from "./consent-data";
const [action, path] = process.argv.slice(2);
if (!/^\/tmp\/sikin-consent-fixture-[a-f0-9-]+\.json$/.test(path))
  throw new Error("Invalid fixture state path");
assertLocalDevelopmentDatabase(getDatabaseUrl());
const db = getPrisma();
let result: unknown;
const stateSchema = z.object({
  termsIds: z.array(z.uuid()),
  original: z.array(z.uuid()),
  guestId: z.uuid(),
});
try {
  if (action === "initialize") {
    const original = await db.consentTermsVersion.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    const fixture = await consentFixture();
    const guest = createGuestSession();
    await writeFile(
      path,
      JSON.stringify({
        termsIds: [fixture.terms.id],
        original: original.map((x) => x.id),
        guestId: guest.guestDeviceId,
      }),
      { flag: "wx", mode: 0o600 },
    );
    result = { guestId: guest.guestDeviceId, proof: guest.proof, version: fixture.terms.version };
  } else {
    const state = stateSchema.parse(JSON.parse(await readFile(path, "utf8")));
    if (action === "revision") {
      await db.consentTermsVersion.updateMany({
        where: { id: { in: state.termsIds } },
        data: { isActive: false },
      });
      const next = await db.consentTermsVersion.create({
        data: {
          consentType: "BIOMETRIC_FACE_DATA",
          version: `test-revision-${randomUUID().slice(0, 8)}`,
          title: "로컬 개정 동의 검증용",
          contentMarkdown:
            "개정된 로컬 검증용 문안입니다. 수집 항목은 테스트 이미지와 참고 정보이며 실제 서비스 동의가 아닙니다. 검증 후 테스트 기록을 정리합니다. 거부해도 문진만 이용할 수 있습니다.",
          isActive: true,
          enactedAt: new Date(Date.now() - 1000),
        },
      });
      state.termsIds.push(next.id);
      await writeFile(path, JSON.stringify(state), { mode: 0o600 });
      result = { version: next.version };
    } else if (action === "inspect") {
      const records = await db.userConsentHistory.findMany({
        where: { guestDeviceId: state.guestId },
        select: { termsVersion: true, ipSource: true, ipAddress: true },
      });
      result = {
        versions: records.map((x) => x.termsVersion),
        ipsUnavailable: records.every((x) => x.ipSource === "UNAVAILABLE" && x.ipAddress === null),
        uploads: await db.imageUploadSession.count({ where: { guestDeviceId: state.guestId } }),
      };
    } else if (action === "cleanup") {
      await db.userConsentHistory.deleteMany({ where: { guestDeviceId: state.guestId } });
      await db.consentTermsVersion.deleteMany({ where: { id: { in: state.termsIds } } });
      for (const id of state.original)
        await db.consentTermsVersion.update({ where: { id }, data: { isActive: true } });
      await unlink(path);
      result = { cleaned: true };
    } else throw new Error("Unknown action");
  }
} finally {
  await db.$disconnect();
}
process.stdout.write(JSON.stringify(result));
