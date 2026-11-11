import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSummary, readCookies, cookieStore } = vi.hoisted(() => ({
  getSummary: vi.fn(),
  readCookies: vi.fn(),
  cookieStore: { get: vi.fn() },
}));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => cookieStore) }));
vi.mock("@/lib/session/identity", () => ({ readSessionCookies: readCookies }));
vi.mock("@/lib/dashboard/summary", () => ({ getDashboardSummary: getSummary }));

import { GET } from "@/app/api/v1/dashboard/summary/route";

beforeEach(() => {
  getSummary.mockReset();
  readCookies.mockReset().mockReturnValue({});
});

describe("dashboard API boundary", () => {
  it("returns only the shared projection and prevents private response caching", async () => {
    const summary = {
      hasDiagnosticHistory: false,
      user: { isAuthenticated: false, nickname: null },
      latestDiagnostic: null,
      todaySnapshot: {
        isRecorded: false,
        recordDate: "2026-11-10",
        snapshotId: null,
        feedbackComment: null,
        conditions: null,
      },
    };
    const credentials = { guestId: "server-cookie-identifier", guestProof: "server-cookie-proof" };
    readCookies.mockReturnValueOnce(credentials);
    getSummary.mockResolvedValueOnce(summary);
    const response = await GET(
      new Request("http://localhost/api/v1/dashboard/summary", {
        headers: { "x-user-id": "another-user" },
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("Cookie");
    expect(readCookies).toHaveBeenCalledWith(cookieStore);
    expect(getSummary).toHaveBeenCalledWith(credentials);
    expect(await response.json()).toEqual({ success: true, data: summary });
  });

  it("rejects caller-supplied resource selectors before reading any records", async () => {
    const response = await GET(
      new Request("http://localhost/api/v1/dashboard/summary?userId=another-user"),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: "INVALID_DASHBOARD_REQUEST" },
    });
    expect(getSummary).not.toHaveBeenCalled();
    expect(readCookies).not.toHaveBeenCalled();
  });

  it("redacts failures from both the response and logs", async () => {
    const privateError = "private-database-and-session-details";
    getSummary.mockRejectedValueOnce(new Error(privateError));
    const logger = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await GET(new Request("http://localhost/api/v1/dashboard/summary"));
    expect(response.status).toBe(500);
    const body: unknown = await response.json();
    expect(body).toEqual({
      success: false,
      error: {
        code: "DASHBOARD_FETCH_FAILED",
        message: "대시보드 요약 정보를 조회하는 중 서버 오류가 발생했습니다.",
      },
    });
    expect(JSON.stringify(body)).not.toContain(privateError);
    expect(JSON.stringify(logger.mock.calls)).not.toContain(privateError);
  });
});
