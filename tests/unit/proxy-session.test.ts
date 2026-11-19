// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
const identity = vi.hoisted(() => vi.fn());
vi.mock("@/lib/session/identity", () => ({
  APP_SESSION_COOKIE_NAME: "app_session_token",
  resolveRequestIdentity: identity,
}));
import { proxy } from "../../proxy";
import { createGuestSession, verifyGuestProof } from "@/lib/session/guest-proof";
beforeEach(() => {
  vi.stubEnv("AUTH_COOKIE_SECRET", "unit-only-guest-proof-key-not-a-real-key");
  identity.mockReset();
  identity.mockResolvedValue({ kind: "anonymous" });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
describe("guest and member proxy lifecycle", () => {
  it("replaces raw spoofed headers with a fresh signed guest capability", async () => {
    const r = await proxy(
      new NextRequest("https://sikin.test/diagnostic", {
        headers: { "x-guest-session-id": "4b579c57-a36b-449f-aecc-7459783b82da" },
      }),
    );
    const id = r.cookies.get("x-guest-session-id")?.value,
      proof = r.cookies.get("sikin_guest_proof")?.value;
    expect(verifyGuestProof(id, proof)).toBe(true);
    expect(r.headers.get("x-middleware-request-x-guest-session-id")).toBeNull();
  });
  it("does not mint another guest after a live member session has been verified", async () => {
    identity.mockResolvedValue({ kind: "member", userId: "verified-by-database" });
    const g = createGuestSession();
    const token = "a".repeat(64);
    const r = await proxy(
      new NextRequest("https://sikin.test/mypage", {
        headers: {
          cookie: `app_session_token=${token}; x-guest-session-id=${g.guestDeviceId}; sikin_guest_proof=${g.proof}`,
        },
      }),
    );
    expect(identity).toHaveBeenCalledWith({ sessionToken: token });
    expect(r.cookies.get("x-guest-session-id")?.maxAge).toBe(0);
    expect(r.cookies.get("sikin_guest_proof")?.maxAge).toBe(0);
    expect(r.headers.get("x-middleware-request-cookie")).not.toContain("sikin_guest_proof");
  });
  it("falls back to a signed guest after a revoked member token resolves anonymous", async () => {
    const r = await proxy(
      new NextRequest("https://sikin.test/", {
        headers: { cookie: `app_session_token=${"a".repeat(64)}` },
      }),
    );
    expect(
      verifyGuestProof(
        r.cookies.get("x-guest-session-id")?.value,
        r.cookies.get("sikin_guest_proof")?.value,
      ),
    ).toBe(true);
  });
  it("reports identity lookup failure rather than pretending the member logged out", async () => {
    identity.mockRejectedValue(new Error("DB unavailable"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const r = await proxy(
      new NextRequest("https://sikin.test/", {
        headers: { cookie: `app_session_token=${"a".repeat(64)}` },
      }),
    );
    expect(r.status).toBe(503);
    expect(r.cookies.get("x-guest-session-id")).toBeUndefined();
  });
});
