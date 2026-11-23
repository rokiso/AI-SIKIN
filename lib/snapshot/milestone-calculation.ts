import { calculateStreakDays, previousDate } from "./calendar";
import type { StreakData } from "./milestone-types";
type Level = "LOW" | "BALANCED" | "HIGH";
export function calculateStreak(dates: readonly string[], today: string) {
  const sorted = [...new Set(dates.filter((date) => date <= today))].sort();
  let longestStreak = 0,
    run = 0,
    previous: string | undefined;
  for (const date of sorted) {
    run = previous === previousDate(date) ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
    previous = date;
  }
  const currentStreak = calculateStreakDays(sorted, today);
  const target = currentStreak < 3 ? 3 : currentStreak < 7 ? 7 : null;
  const nextMilestone: StreakData["nextMilestone"] =
    target === null
      ? null
      : {
          milestoneType: target === 3 ? "STREAK_3_DAYS" : "STREAK_7_DAYS",
          targetStreak: target,
          remainingDays: target - currentStreak,
        };
  return {
    currentStreak,
    longestStreak,
    lastRecordedDate: sorted.at(-1) ?? null,
    todayRecorded: sorted.includes(today),
    nextMilestone,
  };
}
export function compareCondition(initial: Level | null, current: Level | null, sebum = false) {
  const rank = { LOW: 0, BALANCED: 1, HIGH: 2 };
  const improved =
    initial === null || current === null
      ? null
      : sebum
        ? Math.abs(rank[current] - 1) < Math.abs(rank[initial] - 1)
        : rank[current] > rank[initial];
  return { initial, current, improved };
}
export function milestoneComment(days: number, measured: boolean) {
  return `${days}일 연속 기록을 달성했어요! ${
    measured
      ? "시작일과 달성일 사진의 보습·진정·유분 참고 분류를 비교해 보세요. 조명과 촬영 환경에 따라 달라질 수 있으며 피부 개선이나 관리 효과를 입증하지 않습니다."
      : "AI 참고 분류가 없는 사진이 있어 피부 상태 변화는 비교하지 않았어요. 꾸준히 남긴 기록을 돌아보세요."
  }`;
}
