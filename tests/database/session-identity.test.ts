// @vitest-environment node
import { randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { getPrisma } from "@/lib/prisma";
import { getDatabaseUrl } from "@/lib/server-env";
import { assertLocalDevelopmentDatabase } from "@/lib/database-development";
import { createGuestSession } from "@/lib/session/guest-proof";
import { readSessionCookies, resolveRequestIdentity } from "@/lib/session/identity";

const prisma = getPrisma();
const userIds = new Set<string>();
const now = new Date("2026-11-10T00:00:00.000Z");

beforeAll(async () => {
  assertLocalDevelopmentDatabase(getDatabaseUrl());
  await prisma.$queryRaw`SELECT 1`;
});
afterEach(async () => {
  if (userIds.size) await prisma.user.deleteMany({ where: { id: { in: [...userIds] } } });
  userIds.clear();
});
afterAll(async () => prisma.$disconnect());

async function account() {
  const user = await prisma.user.create({ data: { nickname: "세션 접근 검증 사용자" } });
  userIds.add(user.id);
  return user;
}

describe("verified request identity", () => {
  it("treats absent, unsigned or mismatched guest data as anonymous", async () => {
    const guest = createGuestSession(now);
    const stranger = createGuestSession(now);
    expect(await resolveRequestIdentity({}, now)).toEqual({ kind: "anonymous" });
    expect(await resolveRequestIdentity({ guestId: guest.guestDeviceId }, now)).toEqual({ kind: "anonymous" });
    expect(await resolveRequestIdentity({ guestId: stranger.guestDeviceId, guestProof: guest.proof }, now)).toEqual({ kind: "anonymous" });
  });

  it("resolves only the guest identifier bound to a valid capability", async () => {
    const guest = createGuestSession(now);
    expect(await resolveRequestIdentity({ guestId: guest.guestDeviceId, guestProof: guest.proof }, now)).toEqual({ kind: "guest", guestDeviceId: guest.guestDeviceId });
    expect(await resolveRequestIdentity({ guestId: guest.guestDeviceId, guestProof: guest.proof }, new Date(now.getTime() + 31 * 86_400_000))).toEqual({ kind: "anonymous" });
  });

  it("uses the stored unexpired session's user rather than client-provided identity", async () => {
    const user = await account();
    const token = randomBytes(32).toString("hex");
    await prisma.authSession.create({ data: { userId: user.id, sessionToken: token, expiresAt: new Date(now.getTime() + 60_000) } });
    const identity = await resolveRequestIdentity({ sessionToken: token }, now);
    expect(identity).toMatchObject({ kind: "member", userId: user.id, nickname: user.nickname, role: "USER" });
    expect(await resolveRequestIdentity({ sessionToken: randomBytes(32).toString("hex") }, now)).toEqual({ kind: "anonymous" });
  });

  it("does not authorize expired or revoked sessions and still permits an independent valid guest proof", async () => {
    const user = await account();
    const expired = randomBytes(32).toString("hex");
    const revoked = randomBytes(32).toString("hex");
    await prisma.authSession.create({ data: { userId: user.id, sessionToken: expired, expiresAt: new Date(now.getTime() - 1) } });
    const session = await prisma.authSession.create({ data: { userId: user.id, sessionToken: revoked, expiresAt: new Date(now.getTime() + 60_000) } });
    await prisma.authSession.delete({ where: { id: session.id } });
    for (const sessionToken of [expired, revoked, "malformed"]) {
      expect(await resolveRequestIdentity({ sessionToken }, now)).toEqual({ kind: "anonymous" });
    }
    const guest = createGuestSession(now);
    expect(await resolveRequestIdentity({ sessionToken: expired, guestId: guest.guestDeviceId, guestProof: guest.proof }, now)).toEqual({ kind: "guest", guestDeviceId: guest.guestDeviceId });
  });

  it("extracts only the known cookie names and never elevates a caller-supplied user ID", () => {
    const values = new Map([
      ["app_session_token", "opaque-test-token"],
      ["x-guest-session-id", "guest-test-identifier"],
      ["sikin_guest_proof", "guest-test-proof"],
      ["userId", "victim-user"],
    ]);
    expect(readSessionCookies({ get: (name: string) => values.has(name) ? { value: values.get(name) ?? "" } : undefined })).toEqual({ sessionToken: "opaque-test-token", guestId: "guest-test-identifier", guestProof: "guest-test-proof" });
  });
});
