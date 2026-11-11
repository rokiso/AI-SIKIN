import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryRaw, getPrisma } = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  getPrisma: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ getPrisma }));

import { GET } from "@/app/api/v1/health/route";

beforeEach(() => {
  queryRaw.mockReset().mockResolvedValue([{ "?column?": 1 }]);
  getPrisma.mockReset().mockReturnValue({ $queryRaw: queryRaw });
});

describe("public database readiness", () => {
  it("queries PostgreSQL and returns connected status without permitting shared caching", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(queryRaw).toHaveBeenCalledOnce();
    expect(queryRaw.mock.calls[0]?.[0]).toEqual(["SELECT 1"]);
    const body: unknown = await response.json();
    expect(body).toEqual({
      success: true,
      data: {
        status: "pass",
        database: "connected",
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/),
        version: "v1",
      },
    });
  });

  it("returns a safe 503 rather than exposing driver connection details or claiming success", async () => {
    const internalDetails = "private-driver-connection-details";
    queryRaw.mockRejectedValueOnce(new Error(internalDetails));
    const logger = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await GET();
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body: unknown = await response.json();
    expect(body).toEqual({
      success: false,
      error: {
        code: "DATABASE_UNAVAILABLE",
        message: "데이터베이스 연결에 실패했습니다.",
      },
    });
    expect(JSON.stringify(body)).not.toContain(internalDetails);
    expect(JSON.stringify(logger.mock.calls)).not.toContain(internalDetails);
  });

  it("handles missing configuration with the same safe unavailable contract", async () => {
    getPrisma.mockImplementationOnce(() => {
      throw new Error("Database configuration is missing");
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await GET();
    expect(response.status).toBe(503);
    expect(queryRaw).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: "DATABASE_UNAVAILABLE" },
    });
  });
});
