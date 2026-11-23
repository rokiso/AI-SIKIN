import { describe, expect, it } from "vitest";
import { getKstDate } from "@/lib/dashboard/date";
import {
  calculateStreak,
  compareCondition,
  milestoneComment,
} from "@/lib/snapshot/milestone-calculation";
describe("snapshot milestone calculations", () => {
  it("counts today or yesterday in KST and resets after an omitted day", () => {
    const dates = ["2026-11-01", "2026-11-02", "2026-11-03"];
    expect(calculateStreak(dates, "2026-11-03")).toMatchObject({
      currentStreak: 3,
      longestStreak: 3,
      todayRecorded: true,
      nextMilestone: { targetStreak: 7, remainingDays: 4 },
    });
    expect(calculateStreak(dates, "2026-11-04")).toMatchObject({
      currentStreak: 3,
      todayRecorded: false,
    });
    expect(calculateStreak(dates, "2026-11-05")).toMatchObject({
      currentStreak: 0,
      longestStreak: 3,
    });
    expect(calculateStreak([...dates, "2026-11-05"], "2026-11-05").currentStreak).toBe(1);
  });
  it("handles unsorted duplicates, future dates, year boundaries and leap days", () => {
    expect(
      calculateStreak(
        ["2027-01-01", "2026-12-30", "2026-12-31", "2026-12-31", "2027-01-04"],
        "2027-01-01",
      ),
    ).toMatchObject({ currentStreak: 3, longestStreak: 3, lastRecordedDate: "2027-01-01" });
    expect(
      calculateStreak(["2028-02-28", "2028-02-29", "2028-03-01"], "2028-03-01").currentStreak,
    ).toBe(3);
    expect(calculateStreak([], "2026-11-23")).toMatchObject({
      currentStreak: 0,
      longestStreak: 0,
      lastRecordedDate: null,
      nextMilestone: { remainingDays: 3 },
    });
  });
  it("changes days at Korean midnight and stops inventing goals after seven", () => {
    const dates = Array.from({ length: 7 }, (_, i) => `2026-11-0${i + 1}`);
    expect(calculateStreak(dates, getKstDate(new Date("2026-11-07T14:59:59Z"))).todayRecorded).toBe(
      true,
    );
    expect(calculateStreak(dates, getKstDate(new Date("2026-11-07T15:00:00Z")))).toMatchObject({
      currentStreak: 7,
      todayRecorded: false,
      nextMilestone: null,
    });
  });
  it("compares hydration/soothing upward, sebum toward balance, and never fills unmeasured levels", () => {
    expect(compareCondition("LOW", "BALANCED").improved).toBe(true);
    expect(compareCondition("HIGH", "BALANCED", true).improved).toBe(true);
    expect(compareCondition("LOW", "HIGH", true).improved).toBe(false);
    expect(compareCondition("BALANCED", "HIGH", true).improved).toBe(false);
    expect(compareCondition(null, "BALANCED")).toEqual({
      initial: null,
      current: "BALANCED",
      improved: null,
    });
    expect(milestoneComment(3, false)).toContain("비교하지 않았어요");
    expect(milestoneComment(7, true)).toContain("입증하지 않습니다");
  });
});
