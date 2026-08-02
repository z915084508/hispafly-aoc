import { MINUTES_PER_DAY, MINUTES_PER_WEEK } from "./constants.ts";

export type WeeklyWindow = { scheduleId?: string; routeId: string; aircraftId: string; dayOfWeek: number; startsAtMinute: number; endsAtMinute: number; departureAirportId: string | null; arrivalAirportId: string | null };

export function validDate(value: Date) { return value instanceof Date && Number.isFinite(value.getTime()); }
export function effectivePeriodsOverlap(aFrom: Date, aUntil: Date | null | undefined, bFrom: Date, bUntil: Date | null | undefined) {
  return aFrom <= (bUntil ?? new Date(8640000000000000)) && bFrom <= (aUntil ?? new Date(8640000000000000));
}
export function expandWeeklyWindows(input: { scheduleId?: string; routeId: string; aircraftId: string; daysOfWeek: number[]; departureTimeMinutesUtc: number; scheduledDurationMinutes: number; departureAirportId: string | null; arrivalAirportId: string | null }, weekOffsets = [0]): WeeklyWindow[] {
  return input.daysOfWeek.flatMap((dayOfWeek) => weekOffsets.map((weekOffset) => {
    const startsAtMinute = (dayOfWeek - 1) * MINUTES_PER_DAY + input.departureTimeMinutesUtc + weekOffset * MINUTES_PER_WEEK;
    return { scheduleId: input.scheduleId, routeId: input.routeId, aircraftId: input.aircraftId, dayOfWeek, startsAtMinute, endsAtMinute: startsAtMinute + input.scheduledDurationMinutes, departureAirportId: input.departureAirportId, arrivalAirportId: input.arrivalAirportId };
  }));
}
export function minutesToUtcDate(minutes: number) { return new Date(Date.UTC(2026, 0, 5) + minutes * 60_000); }
export function utcDayOfWeek(date: Date) { const day = date.getUTCDay(); return day === 0 ? 7 : day; }
export function proposedWindowForDate(date: Date, departureMinute: number, duration: number) {
  const startOfDay = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const startsAt = new Date(startOfDay + departureMinute * 60_000);
  return { startsAt, endsAt: new Date(startsAt.getTime() + duration * 60_000) };
}
