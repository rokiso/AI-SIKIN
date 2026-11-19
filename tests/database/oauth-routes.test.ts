import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { value: jar.get(name) } : undefined),
  }),
}));
import { GET as authorize } from "@/app/api/v1/auth/authorize/[provider]/route";
import { POST as callback } from "@/app/api/v1/auth/callback/[provider]/route";
import { GET as me } from "@/app/api/v1/auth/me/route";
import { POST as logout } from "@/app/api/v1/auth/logout/route";
import { getPrisma } from "@/lib/prisma";
import { getDatabaseUrl } from "@/lib/server-env";
import { assertLocalDevelopmentDatabase } from "@/lib/database-development";
import { createGuestSession } from "@/lib/session/guest-proof";
import { digest } from "@/lib/auth/pkce";
const db = getPrisma();
const states = new Set<string>();
const people = new Set<string>();
const diagnosticIds = new Set<string>();
const imageIds = new Set<string>();
const context = { params: Promise.resolve({ provider: "google" }) };
function request(path: string, body: unknown) {
  return new Request(`https://sikin.test${path}`, {
    method: "POST",
    headers: { origin: "https://sikin.test", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
beforeAll(() => assertLocalDevelopmentDatabase(getDatabaseUrl()));
beforeEach(() => {
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-secret");
  vi.stubEnv("KAKAO_CLIENT_ID", "test-kakao-client");
  vi.stubEnv("KAKAO_CLIENT_SECRET", "test-kakao-secret");
  vi.stubEnv("GOOGLE_REDIRECT_URI", "");
  vi.stubEnv("KAKAO_REDIRECT_URI", "");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://sikin.test");
  const guest = createGuestSession();
  jar.set("x-guest-session-id", guest.guestDeviceId);
  jar.set("sikin_guest_proof", guest.proof);
});
afterEach(async () => {
  await db.diagnosticSession.deleteMany({ where: { id: { in: [...diagnosticIds] } } });
  await db.imageUploadSession.deleteMany({ where: { id: { in: [...imageIds] } } });
  diagnosticIds.clear();
  imageIds.clear();
  const accounts = await db.userAccount.findMany({
    where: { providerAccountId: { in: [...people] } },
    select: { userId: true },
  });
  await db.user.deleteMany({ where: { id: { in: accounts.map((x) => x.userId) } } });
  await db.oAuthAttempt.deleteMany({
    where: {
      OR: [
        { stateHash: { in: [...states] } },
        { ownerHash: digest(jar.get("x-guest-session-id") ?? "") },
      ],
    },
  });
  states.clear();
  people.clear();
  jar.clear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
afterAll(async () => db.$disconnect());
async function start() {
  const response = await authorize(
    new Request("https://sikin.test/api/v1/auth/authorize/google?redirect_url=%2Fmypage"),
    context,
  );
  expect(response.status).toBe(200);
  const body = await response.json();
  const url = new URL(body.data.authorizationUrl);
  const state = url.searchParams.get("state") ?? "";
  states.add(digest(state));
  jar.set("oauth_pkce_payload", response.cookies.get("oauth_pkce_payload")?.value ?? "");
  expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  return state;
}
describe("OAuth API integration", () => {
  it.each(["google", "kakao"] as const)(
    "%s callback atomically binds guest records and expires both guest cookies",
    async (provider) => {
      const guestId = jar.get("x-guest-session-id")!;
      const session = await db.diagnosticSession.create({
        data: {
          guestDeviceId: guestId,
          surveyAnswers: {},
          axisScores: {},
          status: "SURVEY_COMPLETED",
        },
      });
      diagnosticIds.add(session.id);
      const image = await db.imageUploadSession.create({
        data: {
          guestDeviceId: guestId,
          s3Key: `raw-faces/${randomUUID()}.jpeg`,
          mimeType: "image/jpeg",
          fileSizeBytes: 1024,
          expiresAt: new Date(Date.now() + 60000),
        },
      });
      imageIds.add(image.id);
      const ctx = { params: Promise.resolve({ provider }) };
      const started = await authorize(
        new Request(`https://sikin.test/api/v1/auth/authorize/${provider}?redirect_url=%2Fmypage`),
        ctx,
      );
      expect(started.status).toBe(200);
      const state = new URL((await started.json()).data.authorizationUrl).searchParams.get(
        "state",
      )!;
      states.add(digest(state));
      jar.set("oauth_pkce_payload", started.cookies.get("oauth_pkce_payload")!.value);
      const id =
        provider === "google"
          ? randomUUID()
          : Number.parseInt(randomUUID().replaceAll("-", "").slice(0, 12), 16) + 1;
      people.add(String(id));
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValueOnce(Response.json({ access_token: "test-only-token" }))
          .mockResolvedValueOnce(
            Response.json(
              provider === "google"
                ? { sub: id, name: "이관 검증 회원" }
                : { id, kakao_account: { profile: { nickname: "이관 검증 회원" } } },
            ),
          ),
      );
      const response = await callback(
        request(`/api/v1/auth/callback/${provider}`, { code: "test-only-code", state }),
        ctx,
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data).toMatchObject({
        migratedSessionsCount: 1,
        migratedDiagnosticSessions: 1,
        migratedImageSessions: 1,
        redirectUrl: "/mypage",
      });
      expect(
        (await db.diagnosticSession.findUniqueOrThrow({ where: { id: session.id } })).userId,
      ).toBe(body.data.user.id);
      expect(
        (await db.imageUploadSession.findUniqueOrThrow({ where: { id: image.id } })).userId,
      ).toBe(body.data.user.id);
      for (const name of ["x-guest-session-id", "sikin_guest_proof"]) {
        expect(response.cookies.get(name)?.value).toBe("");
        expect(response.cookies.get(name)?.maxAge).toBe(0);
      }
      expect(response.cookies.get("app_session_token")?.value).toMatch(/^[a-f0-9]{64}$/);
      expect(response.cookies.get("miruvia_migration_notice")?.value).toBe("1");
    },
  );
  it("supports authorize → callback → me → logout with actual DB sessions", async () => {
    const state = await start();
    const id = randomUUID();
    people.add(id);
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ access_token: "test-token" }))
      .mockResolvedValueOnce(Response.json({ sub: id, name: "로그인 사용자" }));
    vi.stubGlobal("fetch", fetcher);
    const response = await callback(
      request("/api/v1/auth/callback/google", { code: "valid-code", state }),
      context,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.redirectUrl).toBe("/mypage");
    expect(JSON.stringify(body)).not.toContain("sessionToken");
    const token = response.cookies.get("app_session_token")?.value;
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=lax");
    jar.set("app_session_token", token ?? "");
    expect(await (await me()).json()).toMatchObject({
      data: { isAuthenticated: true, user: { nickname: "로그인 사용자" } },
    });
    const replay = await callback(
      request("/api/v1/auth/callback/google", { code: "valid-code", state }),
      context,
    );
    expect(replay.status).toBe(400);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const out = await logout(request("/api/v1/auth/logout", {}));
    expect(out.status).toBe(200);
    expect(await db.authSession.findUnique({ where: { sessionToken: token } })).toBeNull();
    expect(out.cookies.get("app_session_token")?.value).toBe("");
    expect(await (await me()).json()).toMatchObject({
      data: { isAuthenticated: false, user: null },
    });
  });
  it.each(["google", "kakao"] as const)(
    "returns safe 502 for %s rejected credentials without issuing a member session",
    async (provider) => {
      const ctx = { params: Promise.resolve({ provider }) };
      const started = await authorize(
        new Request(`https://sikin.test/api/v1/auth/authorize/${provider}`),
        ctx,
      );
      expect(started.status).toBe(200);
      const url = new URL((await started.json()).data.authorizationUrl);
      const state = url.searchParams.get("state")!;
      states.add(digest(state));
      jar.set("oauth_pkce_payload", started.cookies.get("oauth_pkce_payload")!.value);
      const fetcher = vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { error: "invalid_client", error_description: "private-provider-marker" },
            { status: 401 },
          ),
        );
      vi.stubGlobal("fetch", fetcher);
      const response = await callback(
        request(`/api/v1/auth/callback/${provider}`, { code: "test-code", state }),
        ctx,
      );
      expect(response.status).toBe(502);
      const body = await response.json();
      expect(body).toMatchObject({ success: false, error: { code: "OAUTH_PROVIDER_ERROR" } });
      expect(JSON.stringify(body)).not.toContain("private-provider-marker");
      expect(JSON.stringify(body)).not.toContain("test-secret");
      expect(response.cookies.get("app_session_token")).toBeUndefined();
      expect(fetcher).toHaveBeenCalledOnce();
    },
  );
  it("fails a misconfigured redirect before consuming an OAuth allowance", async () => {
    vi.stubEnv("GOOGLE_REDIRECT_URI", "https://wrong.test/auth/callback/google");
    const response = await authorize(
      new Request("https://sikin.test/api/v1/auth/authorize/google"),
      context,
    );
    expect(response.status).toBe(503);
    expect(
      await db.oAuthAttempt.count({ where: { ownerHash: digest(jar.get("x-guest-session-id")!) } }),
    ).toBe(0);
    expect(JSON.stringify(await response.json())).not.toContain("wrong.test");
  });
  it("rejects mismatched state and provider before any provider call", async () => {
    await start();
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const response = await callback(
      request("/api/v1/auth/callback/google", { code: "code", state: "x".repeat(43) }),
      context,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "INVALID_OAUTH_STATE" } });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("fails closed on cross-site logout and malformed or oversized callback bodies", async () => {
    const crossSite = new Request("https://sikin.test/api/v1/auth/logout", {
      method: "POST",
      headers: { origin: "https://evil.test" },
    });
    expect((await logout(crossSite)).status).toBe(403);
    expect(
      (await callback(request("/api/v1/auth/callback/google", { code: "x".repeat(9000) }), context))
        .status,
    ).toBe(400);
    expect((await logout(request("/api/v1/auth/logout", {}))).status).toBe(401);
    expect(await (await me()).json()).toMatchObject({ data: { isAuthenticated: false } });
  });
  it("limits authorization attempts per signed guest", async () => {
    for (let i = 0; i < 10; i++) await start();
    const limited = await authorize(
      new Request("https://sikin.test/api/v1/auth/authorize/google"),
      context,
    );
    expect(limited.status).toBe(429);
  });
});
