import { DEFAULT_MIN_TURNAROUND_MINUTES } from "./constants.ts";
import type { ScheduleValidationResult } from "./types.ts";

export const PLANNER_VISIBLE_STATUSES = ["DRAFT", "ACTIVE", "SUSPENDED"] as const;
const DAY = 86_400_000;
export type PlannerFlightInstance = { id: string; scheduleId: string | null; operatingDate: Date; status: string; generationKey: string | null };
export type PlannerSchedule = { id: string; code: string; status: string; daysOfWeek: number[]; departureTimeMinutesUtc: number; scheduledDurationMinutes: number; effectiveFrom: Date; effectiveUntil: Date | null; route: { flightNumber: string | null; departure: string; arrival: string }; defaultFleet?: { code: string | null } | null; assignedAircraft?: { registration: string | null } | null; validation?: ScheduleValidationResult };
export type PlannerSegment = { key: string; scheduleId: string; flightId: string | null; flightStatus: string | null; dayOfWeek: number; operatingDate: Date; startsAt: Date; endsAt: Date; startMinute: number; endMinute: number; continuation: "NONE" | "FROM_PREVIOUS_DAY" | "TO_NEXT_DAY"; lane: number; laneCount: number; schedule: PlannerSchedule };
export type PlannerDay = { dayOfWeek: number; operatingDate: Date; segments: PlannerSegment[]; laneCount: number };
export type PlannerWeek = { startUtc: Date; endUtc: Date; days: PlannerDay[] };

export const utcDate = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
export function normalizeWeekStartUtc(date: Date) { const value = utcDate(date); const weekday = value.getUTCDay() || 7; return new Date(value.getTime() - (weekday - 1) * DAY); }
export const weekDates = (start: Date) => Array.from({ length: 7 }, (_, index) => new Date(normalizeWeekStartUtc(start).getTime() + index * DAY));
export function isCurrentPlannerWeek(start: Date, now = new Date()) { return normalizeWeekStartUtc(start).getTime() === normalizeWeekStartUtc(now).getTime(); }
const weekday = (date: Date) => date.getUTCDay() || 7;
const inPeriod = (date: Date, schedule: PlannerSchedule) => date >= utcDate(schedule.effectiveFrom) && (!schedule.effectiveUntil || date <= utcDate(schedule.effectiveUntil));
const visible = (schedule: PlannerSchedule, includeExpired: boolean) => PLANNER_VISIBLE_STATUSES.includes(schedule.status as typeof PLANNER_VISIBLE_STATUSES[number]) || (includeExpired && schedule.status === "EXPIRED");
const instanceFor = (scheduleId: string, date: Date, flights: PlannerFlightInstance[]) => flights.find((flight) => flight.scheduleId === scheduleId && utcDate(flight.operatingDate).getTime() === date.getTime());

export function allocatePlannerLanes(segments: PlannerSegment[]) {
  const sorted = [...segments].sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute || a.key.localeCompare(b.key));
  const laneEnds: number[] = [];
  for (const segment of sorted) { let lane = laneEnds.findIndex((end) => end <= segment.startMinute); if (lane < 0) lane = laneEnds.length; laneEnds[lane] = segment.endMinute; segment.lane = lane; }
  const laneCount = Math.max(1, laneEnds.length); for (const segment of sorted) segment.laneCount = laneCount;
  return sorted;
}

export function buildPlannerWeek(input: { weekStartUtc: Date; schedules: PlannerSchedule[]; flights?: PlannerFlightInstance[]; includeExpired?: boolean }): PlannerWeek {
  const startUtc = normalizeWeekStartUtc(input.weekStartUtc), dates = weekDates(startUtc), flights = input.flights ?? [];
  const days = dates.map((operatingDate) => ({ dayOfWeek: weekday(operatingDate), operatingDate, segments: [] as PlannerSegment[], laneCount: 1 }));
  const add = (dayIndex: number, schedule: PlannerSchedule, sourceDate: Date, startMinute: number, endMinute: number, continuation: PlannerSegment["continuation"]) => {
    if (dayIndex < 0 || dayIndex > 6 || endMinute <= startMinute) return;
    const flight = instanceFor(schedule.id, sourceDate, flights);
    days[dayIndex].segments.push({ key: `${schedule.id}:${sourceDate.toISOString().slice(0,10)}:${continuation}`, scheduleId: schedule.id, flightId: flight?.id ?? null, flightStatus: flight?.status ?? null, dayOfWeek: days[dayIndex].dayOfWeek, operatingDate: days[dayIndex].operatingDate, startsAt: new Date(days[dayIndex].operatingDate.getTime() + startMinute * 60_000), endsAt: new Date(days[dayIndex].operatingDate.getTime() + endMinute * 60_000), startMinute, endMinute, continuation, lane: 0, laneCount: 1, schedule });
  };
  for (const schedule of input.schedules.filter((item) => visible(item, Boolean(input.includeExpired)))) {
    dates.forEach((date, dayIndex) => { if (!schedule.daysOfWeek.includes(weekday(date)) || !inPeriod(date, schedule)) return; const end = schedule.departureTimeMinutesUtc + schedule.scheduledDurationMinutes; if (end <= 1440) add(dayIndex, schedule, date, schedule.departureTimeMinutesUtc, end, "NONE"); else { add(dayIndex, schedule, date, schedule.departureTimeMinutesUtc, 1440, "TO_NEXT_DAY"); add(dayIndex + 1, schedule, date, 0, Math.min(end - 1440, 1440), "FROM_PREVIOUS_DAY"); } });
    const previousDate = new Date(startUtc.getTime() - DAY); const previousEnd = schedule.departureTimeMinutesUtc + schedule.scheduledDurationMinutes; if (previousEnd > 1440 && schedule.daysOfWeek.includes(weekday(previousDate)) && inPeriod(previousDate, schedule)) add(0, schedule, previousDate, 0, Math.min(previousEnd - 1440, 1440), "FROM_PREVIOUS_DAY");
  }
  for (const day of days) { day.segments = allocatePlannerLanes(day.segments); day.laneCount = day.segments[0]?.laneCount ?? 1; }
  return { startUtc, endUtc: new Date(startUtc.getTime() + 7 * DAY - 1), days };
}

export function plannerValidationCell(schedule: PlannerSchedule, dayOfWeek: number) { if (!schedule.daysOfWeek.includes(dayOfWeek)) return { state: "OFF" as const, label: "—", issues: [] }; const day = schedule.validation?.days.find((item) => item.dayOfWeek === dayOfWeek); if (!day) return { state: "UNKNOWN" as const, label: "?", issues: [] }; if (day.issues.some(({ severity }) => severity === "ERROR")) return { state: "ERROR" as const, label: "✕", issues: day.issues }; if (day.issues.some(({ severity }) => severity === "WARNING")) return { state: "WARNING" as const, label: "!", issues: day.issues }; return { state: "READY" as const, label: "✓", issues: [] }; }
export function plannerRotationNeighbours(selected: PlannerSegment, segments: PlannerSegment[]) { const sameAircraft = segments.filter((item) => item.schedule.assignedAircraft?.registration === selected.schedule.assignedAircraft?.registration && item.key !== selected.key).sort((a,b) => a.startsAt.getTime() - b.startsAt.getTime()); const previous = [...sameAircraft].reverse().find((item) => item.endsAt <= selected.startsAt); const next = sameAircraft.find((item) => item.startsAt >= selected.endsAt); const availableTurnaround = next ? Math.round((next.startsAt.getTime() - selected.endsAt.getTime()) / 60_000) : null; return { previous, next, availableTurnaround, minimumTurnaround: DEFAULT_MIN_TURNAROUND_MINUTES, earliestNextDeparture: new Date(selected.endsAt.getTime() + DEFAULT_MIN_TURNAROUND_MINUTES * 60_000) }; }
export const roundPlannerMinutes = (minutes: number, increment = 5) => Math.max(0, Math.min(1435, Math.round(minutes / increment) * increment));
export function plannerDraftPrefill(input: { aircraftId?: string | null; fleetId?: string | null; dayOfWeek: number; minute: number; operatingDate: Date }) { const date = input.operatingDate.toISOString().slice(0,10); return { assignedAircraftId: input.aircraftId ?? "", defaultFleetId: input.fleetId ?? "", daysOfWeek: [input.dayOfWeek], departureTimeMinutesUtc: roundPlannerMinutes(input.minute), effectiveFrom: date, effectiveUntil: date }; }
export function reverseDraftSuggestion(schedule: PlannerSchedule) { const overnight = schedule.departureTimeMinutesUtc + schedule.scheduledDurationMinutes >= 1440; const arrivalMinute = (schedule.departureTimeMinutesUtc + schedule.scheduledDurationMinutes) % 1440; return { departure: schedule.route.arrival, arrival: schedule.route.departure, departureTimeMinutesUtc: (arrivalMinute + DEFAULT_MIN_TURNAROUND_MINUTES) % 1440, daysOfWeek: schedule.daysOfWeek.map((day) => overnight ? day === 7 ? 1 : day + 1 : day), code: `${schedule.code}-R` }; }
