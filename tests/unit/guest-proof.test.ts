import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { createGuestSession, verifyGuestProof } from "@/lib/session/guest-proof";

const issuedAt = new Date("2026-11-10T00:00:00.000Z");

beforeEach(() => {
  vi.stubEnv("AUTH_COOKIE_SECRET", "test-only-guest-capability-secret-not-a-real-key");
});
afterEach(() => vi.unstubAllEnvs());

describe("guest ownership proof", () => {
  it("issues an unpredictable fresh identity bound to a signed proof", () => {
    const first = createGuestSession(issuedAt);
    const second = createGuestSession(issuedAt);
    expect(first.guestDeviceId === second.guestDeviceId).toBe(false);
    expect(verifyGuestProof(first.guestDeviceId, first.proof, issuedAt)).toBe(true);
    expect(verifyGuestProof(second.guestDeviceId, first.proof, issuedAt)).toBe(false);
  });

  it("rejects unsigned identities, missing values, malformed proofs and changed signatures", () => {
    const session = createGuestSession(issuedAt);
    for (const proof of [undefined, "", "untrusted", `${session.proof}.extra`]) {
      expect(verifyGuestProof(session.guestDeviceId, proof, issuedAt)).toBe(false);
    }
    expect(verifyGuestProof(undefined, session.proof, issuedAt)).toBe(false);
    expect(verifyGuestProof("not-a-uuid", session.proof, issuedAt)).toBe(false);
    const position = session.proof.length - 2;
    const modified = `${session.proof.slice(0, position)}${session.proof[position] === "a" ? "b" : "a"}${session.proof.slice(position + 1)}`;
    expect(verifyGuestProof(session.guestDeviceId, modified, issuedAt)).toBe(false);
  });

  it("expires the capability after its thirty-day lifetime", () => {
    const session = createGuestSession(issuedAt);
    expect(verifyGuestProof(session.guestDeviceId, session.proof, new Date(issuedAt.getTime() + 29 * 86_400_000))).toBe(true);
    expect(verifyGuestProof(session.guestDeviceId, session.proof, new Date(issuedAt.getTime() + 31 * 86_400_000))).toBe(false);
  });

  it("does not accept a proof under another server secret", () => {
    const session = createGuestSession(issuedAt);
    vi.stubEnv("AUTH_COOKIE_SECRET", "another-test-only-guest-capability-secret-not-real");
    expect(verifyGuestProof(session.guestDeviceId, session.proof, issuedAt)).toBe(false);
  });

  it("fails visibly when the server cannot issue secure capabilities", () => {
    vi.stubEnv("AUTH_COOKIE_SECRET", "");
    expect(() => createGuestSession(issuedAt)).toThrow();
  });
});
