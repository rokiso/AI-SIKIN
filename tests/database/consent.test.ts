import { randomUUID, randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const jar = vi.hoisted(() => new Map<string, string>());
const storage = vi.hoisted(() => ({ sign: vi.fn(), head: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { value: jar.get(name) } : undefined),
  }),
}));
vi.mock("@/lib/storage/s3-vault", () => ({
  signImageUpload: storage.sign,
  readImageMetadata: storage.head,
  signImageView: vi.fn(),
}));
import { getPrisma } from "@/lib/prisma";
import { consentFixture } from "../fixtures/consent-data";
import { POST } from "@/app/api/v1/consents/route";
import { GET as latest } from "@/app/api/v1/consents/terms/latest/route";
import { GET as status } from "@/app/api/v1/consents/status/route";
import { POST as analyze } from "@/app/api/v1/diagnostics/analyze/route";
import { baumannQuestions } from "@/lib/diagnostic/baumannData";
import { POST as issue } from "@/app/api/v1/diagnostics/upload-url/route";
import { createGuestSession } from "@/lib/session/guest-proof";
import { requireBiometricConsent } from "@/lib/consent/service";
import { provisionSession } from "@/lib/auth/session";
import { digest } from "@/lib/auth/pkce";
const db = getPrisma();
let fixture: Awaited<ReturnType<typeof consentFixture>>;
const guests = new Set<string>();
const users = new Set<string>();
const versions = new Set<string>();
let guest: ReturnType<typeof createGuestSession>;
const url = "https://miruvia.test";
function request(body: unknown, headers = {}) {
  return new Request(`${url}/api/v1/consents`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: url, ...headers },
    body: JSON.stringify(body),
  });
}
function submit(version = fixture.terms.version) {
  return POST(
    request(
      { consentType: "BIOMETRIC_FACE_DATA", termsVersion: version, isAgreed: true },
      { "x-forwarded-for": "203.0.113.20, 10.0.0.1", "user-agent": "local-consent-test" },
    ),
  );
}
async function state() {
  return status(new Request(`${url}/api/v1/consents/status`));
}
async function upload() {
  return issue(
    new Request(`${url}/api/v1/diagnostics/upload-url`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: url },
      body: JSON.stringify({ mimeType: "image/jpeg", fileSizeBytes: 10240 }),
    }),
  );
}
async function revision() {
  await db.consentTermsVersion.updateMany({ where: { isActive: true }, data: { isActive: false } });
  const row = await db.consentTermsVersion.create({
    data: {
      consentType: "BIOMETRIC_FACE_DATA",
      version: `v2-${randomUUID().slice(0, 8)}`,
      title: "새 로컬 검증 약관",
      contentMarkdown: "검증용 개정 문안입니다. 실제 운영 동의가 아닙니다.",
      isActive: true,
      enactedAt: new Date(Date.now() - 1000),
    },
  });
  versions.add(row.id);
  return row;
}
beforeAll(async () => {
  fixture = await consentFixture();
});
beforeEach(() => {
  guest = createGuestSession();
  guests.add(guest.guestDeviceId);
  jar.set("x-guest-session-id", guest.guestDeviceId);
  jar.set("sikin_guest_proof", guest.proof);
  vi.stubEnv("CONSENT_TRUSTED_IP_HEADER", "x-forwarded-for");
  storage.sign.mockReset().mockResolvedValue("https://vault.invalid/signed");
  storage.head.mockReset();
});
afterEach(async () => {
  const owner = { OR: [{ guestDeviceId: { in: [...guests] } }, { userId: { in: [...users] } }] };
  await db.diagnosticSession.deleteMany({ where: owner });
  await db.imageUploadSession.deleteMany({ where: owner });
  await db.userConsentHistory.deleteMany({ where: owner });
  await db.user.deleteMany({ where: { id: { in: [...users] } } });
  for (const id of versions) await db.consentTermsVersion.delete({ where: { id } });
  await db.consentTermsVersion.update({
    where: { id: fixture.terms.id },
    data: { isActive: true },
  });
  guests.clear();
  users.clear();
  versions.clear();
  jar.clear();
  vi.unstubAllEnvs();
});
afterAll(async () => {
  await fixture.cleanup();
  await db.$disconnect();
});
describe("versioned biometric consent and enforced upload gateway", () => {
  it("exposes the active public text and private actor status, and appends immutable audit facts", async () => {
    const terms = await latest(new Request(`${url}/api/v1/consents/terms/latest`));
    expect(terms.status).toBe(200);
    expect((await terms.json()).data.termsId).toBe(fixture.terms.id);
    expect((await (await state()).json()).data).toMatchObject({
      hasValidConsent: false,
      requiresReconsent: false,
      consentedVersion: null,
    });
    const saved = await submit();
    expect(saved.status).toBe(201);
    const body = await saved.json();
    expect(body.data).toMatchObject({ isAgreed: true, version: fixture.terms.version });
    expect(JSON.stringify(body)).not.toContain("203.0.113.20");
    const row = await db.userConsentHistory.findUniqueOrThrow({
      where: { id: body.data.consentId },
    });
    expect(row).toMatchObject({
      userId: null,
      guestDeviceId: guest.guestDeviceId,
      termsVersionId: fixture.terms.id,
      ipAddress: "203.0.113.20",
      ipSource: "TRUSTED_HEADER",
      userAgent: "local-consent-test",
    });
    expect((await (await state()).json()).data).toMatchObject({
      hasValidConsent: true,
      requiresReconsent: false,
    });
    await expect(
      db.userConsentHistory.update({ where: { id: row.id }, data: { sensitiveAgreed: false } }),
    ).rejects.toThrow();
    await expect(
      db.userConsentHistory.update({ where: { id: row.id }, data: { ipAddress: "198.51.100.2" } }),
    ).rejects.toThrow();
    const again = await (await submit()).json();
    expect(again.data.consentId).not.toBe(row.id);
    expect(
      await db.userConsentHistory.count({ where: { guestDeviceId: guest.guestDeviceId } }),
    ).toBe(2);
  });
  it("rejects direct uploads before signing and permits them only with current consent", async () => {
    const rejected = await upload();
    expect(rejected.status).toBe(403);
    expect(await rejected.json()).toMatchObject({ error: { code: "CONSENT_REQUIRED" } });
    expect(storage.sign).not.toHaveBeenCalled();
    await submit();
    expect((await upload()).status).toBe(201);
    expect(storage.sign).toHaveBeenCalledOnce();
  });
  it("never sends an old uploaded photo to AI without current consent", async () => {
    vi.stubEnv("AI_LIVE_ENABLED", "1");
    const image = await db.imageUploadSession.create({
      data: {
        guestDeviceId: guest.guestDeviceId,
        s3Key: `test-consent/${randomUUID()}`,
        mimeType: "image/jpeg",
        fileSizeBytes: 10240,
        status: "UPLOADED",
        expiresAt: new Date(Date.now() + 900000),
      },
    });
    const session = await db.diagnosticSession.create({
      data: {
        guestDeviceId: guest.guestDeviceId,
        uploadSessionId: image.id,
        surveyAnswers: baumannQuestions.map((q) => ({ questionId: q.id, selectedChoice: 2 })),
        axisScores: {},
      },
    });
    const response = await analyze(
      new Request(`${url}/api/v1/diagnostics/analyze`, {
        method: "POST",
        headers: { origin: url, "content-type": "application/json" },
        body: JSON.stringify({ sessionId: session.id }),
      }),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({
      source: "QUESTIONNAIRE",
      isFallback: true,
    });
    expect(storage.head).not.toHaveBeenCalled();
    const report = await db.diagnosticReport.findUniqueOrThrow({
      where: { sessionId: session.id },
    });
    expect(report.aiAuditMetadata).toMatchObject({ reason: "CONSENT_REQUIRED" });
  });
  it("forces reconsent after activation and rejects the version that was displayed before the change", async () => {
    await submit();
    const next = await revision();
    expect((await (await state()).json()).data).toMatchObject({
      hasValidConsent: false,
      requiresReconsent: true,
      activeVersion: next.version,
      consentedVersion: fixture.terms.version,
    });
    expect((await submit()).status).toBe(409);
    expect((await upload()).status).toBe(403);
    expect(storage.sign).not.toHaveBeenCalled();
    expect((await submit(next.version)).status).toBe(201);
    expect((await upload()).status).toBe(201);
  });
  it("blocks altered terms text, duplicate active versions and legacy flags without a version binding", async () => {
    await expect(
      db.consentTermsVersion.update({
        where: { id: fixture.terms.id },
        data: { contentMarkdown: "rewritten" },
      }),
    ).rejects.toThrow();
    await expect(
      db.consentTermsVersion.create({
        data: {
          consentType: "BIOMETRIC_FACE_DATA",
          version: "invalid-second-active",
          title: "test",
          contentMarkdown: "test",
          isActive: true,
          enactedAt: new Date(),
        },
      }),
    ).rejects.toThrow();
    await db.userConsentHistory.create({
      data: {
        guestDeviceId: guest.guestDeviceId,
        termsVersion: fixture.terms.version,
        sensitiveAgreed: true,
      },
    });
    expect((await (await state()).json()).data.hasValidConsent).toBe(false);
    expect((await upload()).status).toBe(403);
  });
  it("fails closed with no published terms while preserving the inactive draft", async () => {
    await db.consentTermsVersion.update({
      where: { id: fixture.terms.id },
      data: { isActive: false },
    });
    expect((await latest(new Request(`${url}/api/v1/consents/terms/latest`))).status).toBe(404);
    expect((await submit()).status).toBe(404);
    expect((await upload()).status).toBe(403);
    expect(storage.sign).not.toHaveBeenCalled();
    expect(
      (
        await db.consentTermsVersion.findUniqueOrThrow({
          where: { id: "61a9319c-0b2f-4fd5-868a-770c37960801" },
        })
      ).isActive,
    ).toBe(false);
  });
  it("rejects forged actor/IP bodies, rejected checkboxes, oversized data and foreign origins", async () => {
    const body = {
      consentType: "BIOMETRIC_FACE_DATA",
      termsVersion: fixture.terms.version,
      isAgreed: true,
    };
    for (const data of [
      { ...body, userId: randomUUID() },
      { ...body, ipAddress: "203.0.113.2" },
      { ...body, isAgreed: false },
      { ...body, padding: "x".repeat(5000) },
    ])
      expect((await POST(request(data))).status).toBe(400);
    expect((await POST(request(body, { origin: "https://evil.test" }))).status).toBe(403);
    expect(
      (await status(new Request(`${url}/api/v1/consents/status?userId=${randomUUID()}`))).status,
    ).toBe(400);
    jar.clear();
    expect((await POST(request(body, { "x-guest-session-id": guest.guestDeviceId }))).status).toBe(
      401,
    );
    expect((await state()).status).toBe(401);
  });
  it("records unavailable IP honestly and bounds caller metadata", async () => {
    vi.stubEnv("CONSENT_TRUSTED_IP_HEADER", "");
    const result = await (await submit()).json();
    const row = await db.userConsentHistory.findUniqueOrThrow({
      where: { id: result.data.consentId },
    });
    expect(row.ipAddress).toBeNull();
    expect(row.ipSource).toBe("UNAVAILABLE");
  });
  it("limits parallel consent submissions per verified owner without overwriting records", async () => {
    const results = await Promise.all(Array.from({ length: 12 }, () => submit()));
    expect(results.filter((r) => r.status === 201)).toHaveLength(10);
    expect(results.filter((r) => r.status === 429)).toHaveLength(2);
    expect(
      await db.userConsentHistory.count({ where: { guestDeviceId: guest.guestDeviceId } }),
    ).toBe(10);
  });
  it("transfers guest consent exactly once inside verified OAuth without mutating original facts", async () => {
    const first = await (await submit()).json();
    const before = await db.userConsentHistory.findUniqueOrThrow({
      where: { id: first.data.consentId },
    });
    const raw = randomBytes(32).toString("base64url");
    await db.oAuthAttempt.create({
      data: { stateHash: digest(raw), expiresAt: new Date(Date.now() + 300000) },
    });
    const result = await provisionSession(
      { provider: "google", id: randomUUID(), nickname: "동의 이전 검증", email: null },
      {
        state: raw,
        verifier: "v".repeat(43),
        provider: "google",
        returnPath: "/mypage",
        expires: Date.now() + 300000,
        guestId: guest.guestDeviceId,
      },
      { guestId: guest.guestDeviceId, guestProof: guest.proof },
    );
    users.add(result.user.id);
    const after = await db.userConsentHistory.findUniqueOrThrow({ where: { id: before.id } });
    expect(after).toEqual({ ...before, userId: result.user.id });
    expect((await (await state()).json()).data.hasValidConsent).toBe(false);
    jar.set("app_session_token", result.token);
    expect((await (await state()).json()).data.hasValidConsent).toBe(true);
    const other = await db.user.create({ data: { nickname: "다른 계정" } });
    users.add(other.id);
    await expect(
      db.userConsentHistory.update({ where: { id: before.id }, data: { userId: other.id } }),
    ).rejects.toThrow();
  });
  it("holds active-version validation through the upload transaction while activation waits", async () => {
    await submit();
    let release: () => void = () => {};
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    let locked = false;
    const reading = db.$transaction(async (tx) => {
      await requireBiometricConsent({ kind: "guest", guestDeviceId: guest.guestDeviceId }, tx);
      locked = true;
      await wait;
    });
    try {
      await vi.waitFor(() => expect(locked).toBe(true));
      let changed = false;
      const updating = db.consentTermsVersion
        .update({ where: { id: fixture.terms.id }, data: { isActive: false } })
        .then(() => {
          changed = true;
        });
      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(changed).toBe(false);
      release();
      await reading;
      await updating;
      expect(changed).toBe(true);
    } finally {
      release();
      await reading;
    }
  });
});
