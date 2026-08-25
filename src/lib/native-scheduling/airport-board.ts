export type AirportBoardDirection = "ARRIVAL" | "DEPARTURE";

export type AirportBoardSchedule = {
  id: string;
  code: string;
  flightNumber?: string | null;
  status: string;
  daysOfWeek: number[];
  departureTimeMinutesUtc: number;
  arrivalTimeMinutesUtc: number;
  scheduledDurationMinutes: number;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  route: {
    departure: string;
    arrival: string;
    flightNumber?: string | null;
  };
};

export type AirportBoardMovement<T extends AirportBoardSchedule = AirportBoardSchedule> = {
  schedule: T;
  direction: AirportBoardDirection;
  timeMinutesUtc: number;
  eventDateUtc: Date;
  scheduleOperatingDateUtc: Date;
};

const DAY_MS = 86_400_000;

export function startOfUtcDate(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export function parseAirportBoardDate(value?: string, fallback = new Date()) {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isFinite(parsed.getTime())) return parsed;
  }
  return startOfUtcDate(fallback);
}

export function addUtcDays(value: Date, days: number) {
  return new Date(startOfUtcDate(value).getTime() + days * DAY_MS);
}

export function isoWeekdayUtc(value: Date) {
  return value.getUTCDay() || 7;
}

export function scheduleOperatesOnUtcDate(schedule: AirportBoardSchedule, date: Date) {
  const target = startOfUtcDate(date).getTime();
  const effectiveFrom = startOfUtcDate(schedule.effectiveFrom).getTime();
  const effectiveUntil = schedule.effectiveUntil ? startOfUtcDate(schedule.effectiveUntil).getTime() : Number.POSITIVE_INFINITY;
  return target >= effectiveFrom && target <= effectiveUntil && schedule.daysOfWeek.includes(isoWeekdayUtc(date));
}

export function arrivalDayOffset(schedule: AirportBoardSchedule) {
  return Math.max(0, Math.floor((schedule.departureTimeMinutesUtc + schedule.scheduledDurationMinutes) / 1440));
}

export function normalizeMinutesUtc(minutes: number) {
  if (!Number.isFinite(minutes)) return 0;
  return ((Math.round(minutes) % 1440) + 1440) % 1440;
}

export function formatUtcMinutes(minutes: number) {
  const normalized = normalizeMinutesUtc(minutes);
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

export function timelinePositionPercent(minutes: number) {
  return Math.min(100, Math.max(0, normalizeMinutesUtc(minutes) / 1440 * 100));
}

export function buildAirportBoardMovements<T extends AirportBoardSchedule>(
  schedules: T[],
  airportIcao: string,
  selectedDate: Date,
) {
  const airport = airportIcao.trim().toUpperCase();
  const eventDate = startOfUtcDate(selectedDate);
  const movements: AirportBoardMovement<T>[] = [];

  for (const schedule of schedules) {
    if (schedule.route.departure.toUpperCase() === airport && scheduleOperatesOnUtcDate(schedule, eventDate)) {
      movements.push({
        schedule,
        direction: "DEPARTURE",
        timeMinutesUtc: normalizeMinutesUtc(schedule.departureTimeMinutesUtc),
        eventDateUtc: eventDate,
        scheduleOperatingDateUtc: eventDate,
      });
    }

    if (schedule.route.arrival.toUpperCase() === airport) {
      const operatingDate = addUtcDays(eventDate, -arrivalDayOffset(schedule));
      if (scheduleOperatesOnUtcDate(schedule, operatingDate)) {
        movements.push({
          schedule,
          direction: "ARRIVAL",
          timeMinutesUtc: normalizeMinutesUtc(schedule.arrivalTimeMinutesUtc),
          eventDateUtc: eventDate,
          scheduleOperatingDateUtc: operatingDate,
        });
      }
    }
  }

  return movements.sort((left, right) =>
    left.timeMinutesUtc - right.timeMinutesUtc ||
    (left.schedule.flightNumber ?? left.schedule.route.flightNumber ?? left.schedule.code).localeCompare(right.schedule.flightNumber ?? right.schedule.route.flightNumber ?? right.schedule.code),
  );
}
