import { describe, expect, it } from "vitest";
import {
  calculateStreakDays,
  calendarCells,
  monthBounds,
  monthlyQuerySchema,
} from "@/lib/snapshot/calendar";
import { getKstDate } from "@/lib/dashboard/date";
describe("Korean snapshot calendar", () => {
  it("handles leap years, year rollover, 30-day months and Sunday alignment", () => {
    expect(calendarCells(2026, 11)[0]).toBe("2026-11-01");
    expect(calendarCells(2024, 2).filter(Boolean)).toHaveLength(29);
    expect(calendarCells(2025, 2).filter(Boolean)).toHaveLength(28);
    expect(calendarCells(2026, 4).filter(Boolean)).toHaveLength(30);
    expect(monthBounds(2026, 12)).toEqual({
      start: new Date("2026-12-01T00:00:00Z"),
      end: new Date("2027-01-01T00:00:00Z"),
    });
    expect(getKstDate(new Date("2026-10-31T15:00:00Z"))).toBe("2026-11-01");
  });
  it("counts today or yesterday streaks across month boundaries and stops at gaps", () => {
    const dates = ["2026-11-01", "2026-10-31", "2026-10-30"];
    expect(calculateStreakDays(dates, "2026-11-01")).toBe(3);
    expect(calculateStreakDays(dates, "2026-11-02")).toBe(3);
    expect(calculateStreakDays(dates, "2026-11-03")).toBe(0);
    expect(calculateStreakDays(["2026-11-01", "2026-10-30"], "2026-11-01")).toBe(1);
    expect(calculateStreakDays([], "2026-11-01")).toBe(0);
  });
  it("rejects ambiguous or invalid month queries", () => {
    for (const query of [
      { year: "26", month: "1" },
      { year: "2026", month: "13" },
      { year: "2026", month: "0" },
      { year: "2026", month: "1.0" },
      { year: "2026", month: "1", userId: "victim" },
    ])
      expect(monthlyQuerySchema.safeParse(query).success).toBe(false);
  });
});
