import { describe, expect, it } from "vitest";
import { getKstDate, getKstRecordDate } from "@/lib/dashboard/date";

describe("Korean calendar day keys", () => {
  it("changes dates at Korean midnight, independently of the host timezone", () => {
    expect(getKstDate(new Date("2026-11-09T14:59:59.999Z"))).toBe("2026-11-09");
    expect(getKstDate(new Date("2026-11-09T15:00:00.000Z"))).toBe("2026-11-10");
    expect(getKstDate(new Date("2026-12-31T15:00:00.000Z"))).toBe("2027-01-01");
  });

  it("maps the Korean calendar date to the Prisma PostgreSQL DATE key", () => {
    expect(getKstRecordDate(new Date("2026-11-09T15:30:00.000Z")).toISOString()).toBe(
      "2026-11-10T00:00:00.000Z",
    );
  });
});
