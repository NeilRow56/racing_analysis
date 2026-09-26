export type CalendarPeriod = {
  monthFrom: number;
  monthTo: number;
};

export function matchesCalendarPeriod(
  raceDate: string,
  period: CalendarPeriod | undefined,
): boolean {
  if (!period) {
    return true;
  }
  const month = canonicalRaceDateMonth(raceDate);
  if (month === null) {
    return false;
  }
  return period.monthFrom <= period.monthTo
    ? month >= period.monthFrom && month <= period.monthTo
    : month >= period.monthFrom || month <= period.monthTo;
}

export function calendarPeriodFromValues(
  monthFrom: unknown,
  monthTo: unknown,
): CalendarPeriod | undefined {
  const from = calendarMonth(monthFrom);
  const to = calendarMonth(monthTo);
  return from !== null && to !== null ? { monthFrom: from, monthTo: to } : undefined;
}

export function calendarPeriodLabel(period: CalendarPeriod): string {
  return `${monthShortLabel(period.monthFrom)}–${monthShortLabel(period.monthTo)}`;
}

function calendarMonth(value: unknown): number | null {
  if ((typeof value !== "string" && typeof value !== "number") || String(value).trim() === "") {
    return null;
  }
  const month = Number(value);
  return Number.isInteger(month) && month >= 1 && month <= 12 ? month : null;
}

function canonicalRaceDateMonth(raceDate: string): number | null {
  const match = /^\d{4}-(\d{2})-\d{2}$/.exec(raceDate);
  return match ? calendarMonth(match[1]) : null;
}

function monthShortLabel(month: number): string {
  return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][month - 1] ?? String(month);
}
