import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { getPrisma } from "@/lib/prisma";
import { assertLocalDevelopmentDatabase } from "@/lib/database-development";
import { getDatabaseUrl } from "@/lib/server-env";
import { createGuestSession } from "@/lib/session/guest-proof";
import { digest, type OAuthPayload } from "@/lib/auth/pkce";
import { provisionSession } from "@/lib/auth/session";
import { resolveRequestIdentity } from "@/lib/session/identity";
const db = getPrisma();
const users = new Set<string>();
const guests = new Set<string>();
const states = new Set<string>();
const providerIds = new Set<string>();
beforeAll(async () => {
  assertLocalDevelopmentDatabase(getDatabaseUrl());
  await db.$queryRaw`SELECT 1`;
});
afterEach(async () => {
  const accounts = await db.userAccount.findMany({
    where: { providerAccountId: { in: [...providerIds] } },
    select: { userId: true },
  });
  for (const account of accounts) users.add(account.userId);
  await db.diagnosticSession.deleteMany({ where: { guestDeviceId: { in: [...guests] } } });
  await db.imageUploadSession.deleteMany({ where: { guestDeviceId: { in: [...guests] } } });
  await db.user.deleteMany({ where: { id: { in: [...users] } } });
  await db.oAuthAttempt.deleteMany({ where: { stateHash: { in: [...states] } } });
  users.clear();
  guests.clear();
  states.clear();
  providerIds.clear();
});
afterAll(async () => db.$disconnect());
async function flow(guestId: string | null = null): Promise<OAuthPayload> {
  const state = randomBytes(32).toString("base64url");
  states.add(digest(state));
  const expires = Date.now() + 300000;
  await db.oAuthAttempt.create({
    data: { stateHash: digest(state), expiresAt: new Date(expires) },
  });
  return {
    state,
    verifier: "v".repeat(43),
    provider: "google",
    returnPath: "/mypage",
    guestId,
    expires,
  };
}
function profile() {
  const id = randomUUID();
  providerIds.add(id);
  return { provider: "google" as const, id, nickname: "로그인 테스트", email: null };
}
async function diagnostic(guestDeviceId: string, userId?: string) {
  return db.diagnosticSession.create({
    data: { guestDeviceId, userId, surveyAnswers: {}, axisScores: {}, status: "SURVEY_COMPLETED" },
  });
}
describe("OAuth atomic provisioning", () => {
  it("creates the user/account/session and transfers only verified unowned guest data", async () => {
    const guest = createGuestSession();
    guests.add(guest.guestDeviceId);
    const stranger = await db.user.create({ data: { nickname: "다른 소유자" } });
    users.add(stranger.id);
    const own = await diagnostic(guest.guestDeviceId);
    const other = await diagnostic(guest.guestDeviceId, stranger.id);
    const upload = await db.imageUploadSession.create({
      data: {
        guestDeviceId: guest.guestDeviceId,
        s3Key: `raw-faces/${randomUUID()}.jpeg`,
        mimeType: "image/jpeg",
        fileSizeBytes: 10240,
        expiresAt: new Date(Date.now() + 900000),
      },
    });
    const result = await provisionSession(profile(), await flow(guest.guestDeviceId), {
      guestId: guest.guestDeviceId,
      guestProof: guest.proof,
    });
    users.add(result.user.id);
    expect(result.migratedSessionsCount).toBe(1);
    expect((await db.diagnosticSession.findUniqueOrThrow({ where: { id: own.id } })).userId).toBe(
      result.user.id,
    );
    expect((await db.diagnosticSession.findUniqueOrThrow({ where: { id: other.id } })).userId).toBe(
      stranger.id,
    );
    expect(
      (await db.imageUploadSession.findUniqueOrThrow({ where: { id: upload.id } })).userId,
    ).toBe(result.user.id);
    expect(await resolveRequestIdentity({ sessionToken: result.token })).toMatchObject({
      kind: "member",
      userId: result.user.id,
    });
    const session = await db.authSession.findUniqueOrThrow({
      where: { sessionToken: result.token },
    });
    expect(session.expiresAt.getTime() - Date.now()).toBeGreaterThan(29 * 86400000);
    await db.authSession.delete({ where: { id: session.id } });
    expect(await resolveRequestIdentity({ sessionToken: result.token })).toEqual({
      kind: "anonymous",
    });
  });
  it("does not migrate a stolen guest UUID without its proof", async () => {
    const guest = createGuestSession();
    guests.add(guest.guestDeviceId);
    const row = await diagnostic(guest.guestDeviceId);
    const result = await provisionSession(profile(), await flow(guest.guestDeviceId), {
      guestId: guest.guestDeviceId,
    });
    users.add(result.user.id);
    expect(result.migratedSessionsCount).toBe(0);
    expect(
      (await db.diagnosticSession.findUniqueOrThrow({ where: { id: row.id } })).userId,
    ).toBeNull();
  });
  it("consumes a flow exactly once under concurrent callbacks", async () => {
    const attempt = await flow();
    const person = profile();
    const results = await Promise.allSettled([
      provisionSession(person, attempt, {}),
      provisionSession(person, attempt, {}),
    ]);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    for (const result of results)
      if (result.status === "rejected")
        expect(result.reason).toMatchObject({ code: "INVALID_OAUTH_STATE" });
    expect(await db.userAccount.count({ where: { providerAccountId: person.id } })).toBe(1);
  });
  it("reuses a provider account but never links a second provider by email", async () => {
    const person = { ...profile(), email: `${randomUUID()}@example.test` };
    const a = await provisionSession(person, await flow(), {});
    users.add(a.user.id);
    const b = await provisionSession(person, await flow(), {});
    expect(b.user.id).toBe(a.user.id);
    const otherPerson = { ...profile(), provider: "kakao" as const, email: person.email };
    const c = await provisionSession(otherPerson, await flow(), {});
    users.add(c.user.id);
    expect(c.user.id).not.toBe(a.user.id);
    expect(c.user.email).toBeNull();
  });
  it("blocks expired attempts before any account or session writes", async () => {
    const person = profile();
    const attempt = await flow();
    await db.oAuthAttempt.update({
      where: { stateHash: digest(attempt.state) },
      data: { expiresAt: new Date(0) },
    });
    await expect(provisionSession(person, attempt, {})).rejects.toMatchObject({
      code: "INVALID_OAUTH_STATE",
    });
    expect(await db.userAccount.count({ where: { providerAccountId: person.id } })).toBe(0);
  });
});
