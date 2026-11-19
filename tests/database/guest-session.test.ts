import { randomUUID, randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { value: jar.get(name) } : undefined),
  }),
}));
import { POST } from "../../app/api/v1/auth/guest-session/route";
import { getPrisma } from "@/lib/prisma";
import { getDatabaseUrl } from "@/lib/server-env";
import { assertLocalDevelopmentDatabase } from "@/lib/database-development";
import { createGuestSession, verifyGuestProof } from "@/lib/session/guest-proof";
const db = getPrisma();
const users: string[] = [];
beforeAll(() => assertLocalDevelopmentDatabase(getDatabaseUrl()));
afterEach(async () => {
  jar.clear();
  await db.user.deleteMany({ where: { id: { in: users } } });
  users.length = 0;
});
afterAll(() => db.$disconnect());
const request = (origin = "https://sikin.test", body?: string) =>
  new Request("https://sikin.test/api/v1/auth/guest-session", {
    method: "POST",
    headers: { origin },
    body,
  });
describe("explicit guest capability issuance", () => {
  it("issues a private signed session, preserving identity and creation time on retry", async () => {
    const first = await POST(request());
    expect(first.status).toBe(201);
    const a = (await first.json()).data;
    expect(a.guestDeviceId).toMatch(/^[a-f0-9-]{36}$/);
    expect(a.expiresInSeconds).toBe(2592000);
    expect(first.headers.get("cache-control")).toBe("private, no-store");
    expect(first.headers.get("set-cookie")).toContain("HttpOnly");
    expect(first.headers.get("set-cookie")).toContain("SameSite=lax");
    for (const name of ["x-guest-session-id", "sikin_guest_proof"])
      jar.set(name, first.cookies.get(name)!.value);
    expect(verifyGuestProof(a.guestDeviceId, jar.get("sikin_guest_proof"))).toBe(true);
    const again = await POST(request());
    expect(again.status).toBe(200);
    expect((await again.json()).data).toMatchObject({
      guestDeviceId: a.guestDeviceId,
      createdAt: a.createdAt,
    });
  });
  it("does not sign a forged UUID or accept a raw guest header as ownership proof", async () => {
    const stolen = randomUUID();
    jar.set("x-guest-session-id", stolen);
    const r = await POST(
      new Request("https://sikin.test/api/v1/auth/guest-session", {
        method: "POST",
        headers: { origin: "https://sikin.test", "x-guest-session-id": stolen },
      }),
    );
    expect((await r.json()).data.guestDeviceId).not.toBe(stolen);
  });
  it("rotates expired capabilities without retaining their prior identity", async () => {
    const expired = createGuestSession(new Date(Date.now() - 31 * 86400000));
    jar.set("x-guest-session-id", expired.guestDeviceId);
    jar.set("sikin_guest_proof", expired.proof);
    const r = await POST(request());
    expect(r.status).toBe(201);
    expect((await r.json()).data.guestDeviceId).not.toBe(expired.guestDeviceId);
  });
  it("does not create a guest capability for an authenticated member", async () => {
    const user = await db.user.create({ data: { nickname: "게스트 발급 검증" } });
    users.push(user.id);
    const token = randomBytes(32).toString("hex");
    await db.authSession.create({
      data: { userId: user.id, sessionToken: token, expiresAt: new Date(Date.now() + 60000) },
    });
    jar.set("app_session_token", token);
    const r = await POST(request());
    expect(r.status).toBe(409);
    expect(r.cookies.get("x-guest-session-id")).toBeUndefined();
    expect((await r.json()).error.code).toBe("GUEST_SESSION_NOT_REQUIRED");
  });
  it("rejects cross-origin calls and unexpected request bodies", async () => {
    expect((await POST(request("https://attacker.invalid"))).status).toBe(403);
    expect((await POST(request("https://sikin.test", "{}"))).status).toBe(400);
  });
});
