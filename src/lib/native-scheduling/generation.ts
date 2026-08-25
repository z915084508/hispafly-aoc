import { isValidTimeZone } from "../native-flight/schedule-time.ts";

const DAY = 86_400_000;
export const MAX_GENERATION_HORIZON_DAYS = 365;

export type GenerationSchedule = {
  id: string;
  flightNumber?: string | null;
  callsign?: string | null;
  routeId: string;
  daysOfWeek: number[];
  departureTimeMinutesUtc: number;
  scheduledDurationMinutes: number;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  bookingOpenOffsetMinutes: number;
  bookingCloseOffsetMinutes: number;
  generationHorizonDays: number;
  defaultFleetId: string | null;
  assignedAircraftId: string | null;
  route: {
    flightNumber: string | null;
    callsign: string | null;
    identityReservation?: { flightNumber: string; callsign: string } | null;
    departureAirportId: string | null;
    arrivalAirportId: string | null;
    departureAirport: { icao: string; timezone: string | null } | null;
    arrivalAirport: { icao: string; timezone: string | null } | null;
  };
};

export type GenerationWarning = { code: string; message: string; details?: Record<string, unknown> };
export type ScheduleGenerationSkip = { operatingDate: Date; code: string };
export type ScheduledFlightCandidate = {
  operatingDate: Date;
  scheduledDeparture: Date;
  scheduledArrival: Date;
  generationKey: string;
  bookingOpenAt: Date;
  bookingCloseAt: Date;
  departureLocalTime: string;
  arrivalLocalTime: string;
  departureTimezone: string;
  arrivalTimezone: string;
  status: "SCHEDULED" | "OPEN_FOR_BOOKING";
};
export type ScheduleGenerationPlan = {
  scheduleId: string;
  rangeStart: Date;
  rangeEnd: Date;
  candidates: ScheduledFlightCandidate[];
  skipped: ScheduleGenerationSkip[];
  warnings: GenerationWarning[];
};

const utcDate = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const weekday = (date: Date) => date.getUTCDay() || 7;
const maxDate = (a: Date, b: Date) => a > b ? a : b;
const minDate = (a: Date, b: Date) => a < b ? a : b;
const local = (instant: Date, timeZone: string) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(instant).filter(({ type }) => type !== "literal").map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
};

export function generationIdentity(schedule: GenerationSchedule) {
  const reserved = schedule.route.identityReservation;
  const flightNumber = schedule.flightNumber ?? reserved?.flightNumber ?? schedule.route.flightNumber;
  const callsign = schedule.callsign ?? reserved?.callsign ?? schedule.route.callsign;
  return flightNumber && callsign ? { flightNumber, callsign } : null;
}

export function buildScheduleGenerationPlan(input: { schedule: GenerationSchedule; now: Date; horizonDays?: number }): ScheduleGenerationPlan {
  const { schedule, now } = input;
  const today = utcDate(now);
  const horizonDays = input.horizonDays ?? schedule.generationHorizonDays;
  const rangeStart = maxDate(today, utcDate(schedule.effectiveFrom));
  const horizonEnd = new Date(today.getTime() + horizonDays * DAY);
  const rangeEnd = schedule.effectiveUntil ? minDate(horizonEnd, utcDate(schedule.effectiveUntil)) : horizonEnd;
  const candidates: ScheduledFlightCandidate[] = [], skipped: ScheduleGenerationSkip[] = [], warnings: GenerationWarning[] = [];
  const departureTimezone = schedule.route.departureAirport?.timezone && isValidTimeZone(schedule.route.departureAirport.timezone) ? schedule.route.departureAirport.timezone : "UTC";
  const arrivalTimezone = schedule.route.arrivalAirport?.timezone && isValidTimeZone(schedule.route.arrivalAirport.timezone) ? schedule.route.arrivalAirport.timezone : "UTC";
  if (departureTimezone === "UTC" && schedule.route.departureAirport?.timezone !== "UTC") warnings.push({ code: "AIRPORT_TIMEZONE_FALLBACK_UTC", message: "Se utilizó UTC para el aeropuerto de salida.", details: { airport: schedule.route.departureAirport?.icao } });
  if (arrivalTimezone === "UTC" && schedule.route.arrivalAirport?.timezone !== "UTC") warnings.push({ code: "AIRPORT_TIMEZONE_FALLBACK_UTC", message: "Se utilizó UTC para el aeropuerto de llegada.", details: { airport: schedule.route.arrivalAirport?.icao } });
  if (rangeStart > rangeEnd) return { scheduleId: schedule.id, rangeStart, rangeEnd, candidates, skipped, warnings: [...warnings, { code: "NO_FLIGHTS_IN_CURRENT_HORIZON", message: "La vigencia comienza fuera del horizonte actual." }] };
  for (let operatingDate = rangeStart; operatingDate <= rangeEnd; operatingDate = new Date(operatingDate.getTime() + DAY)) {
    if (!schedule.daysOfWeek.includes(weekday(operatingDate))) continue;
    const scheduledDeparture = new Date(operatingDate.getTime() + schedule.departureTimeMinutesUtc * 60_000);
    const scheduledArrival = new Date(scheduledDeparture.getTime() + schedule.scheduledDurationMinutes * 60_000);
    const bookingOpenAt = new Date(scheduledDeparture.getTime() - schedule.bookingOpenOffsetMinutes * 60_000);
    const bookingCloseAt = new Date(scheduledDeparture.getTime() - schedule.bookingCloseOffsetMinutes * 60_000);
    if (scheduledDeparture <= now) { skipped.push({ operatingDate, code: "DEPARTURE_ALREADY_PASSED" }); continue; }
    if (bookingCloseAt <= now) { skipped.push({ operatingDate, code: "BOOKING_WINDOW_ALREADY_CLOSED" }); continue; }
    candidates.push({ operatingDate, scheduledDeparture, scheduledArrival, generationKey: `schedule:${schedule.id}:${isoDate(operatingDate)}`, bookingOpenAt, bookingCloseAt, departureTimezone, arrivalTimezone, departureLocalTime: local(scheduledDeparture, departureTimezone), arrivalLocalTime: local(scheduledArrival, arrivalTimezone), status: bookingOpenAt <= now ? "OPEN_FOR_BOOKING" : "SCHEDULED" });
  }
  if (!candidates.length) warnings.push({ code: "NO_FLIGHTS_IN_CURRENT_HORIZON", message: "No hay vuelos que generar dentro del horizonte actual." });
  return { scheduleId: schedule.id, rangeStart, rangeEnd, candidates, skipped, warnings };
}
