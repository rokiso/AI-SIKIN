const kstDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function getKstDate(now: Date = new Date()): string {
  const parts = kstDateFormatter.formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) throw new Error("Could not determine the Korean calendar date");
  return `${year}-${month}-${day}`;
}

// PostgreSQL DATE values have no timezone. Prisma represents that date key as
// a UTC-midnight Date; never use the host's local date or a UTC-day range here.
export function getKstRecordDate(now: Date = new Date()): Date {
  return new Date(`${getKstDate(now)}T00:00:00.000Z`);
}
