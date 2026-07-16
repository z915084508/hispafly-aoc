import { addLocalDays, formatIsoDate, localWeekday, parseIsoDate, resolveLocalDateTime } from "./schedule-time.ts";

export type ScheduleGenerationInput = {
  scheduleId: string;
  daysOfWeek: number[];
  departureLocalTimeMinutes: number;
  departureTimezone: string;
  arrivalTimezone: string;
  scheduledDurationMinutes: number;
  effectiveFrom: string;
  effectiveUntil?: string | null;
  from: string;
  to: string;
};

export type PlannedOccurrence =
  | { ok: true; operatingDate: string; scheduledDeparture: Date; scheduledArrival: Date }
  | { ok: false; operatingDate: string; code: string; message: string };

export function validateScheduleRule(input: ScheduleGenerationInput) {
  const errors: Array<{ field: string; code: string; message: string }> = [];
  if (!input.daysOfWeek.length || input.daysOfWeek.some((day) => day < 1 || day > 7)) {
    errors.push({ field: "daysOfWeek", code: "INVALID_WEEKDAYS", message: "Choose at least one weekday from 1 to 7." });
  }
  if (input.departureLocalTimeMinutes < 0 || input.departureLocalTimeMinutes > 1439) {
    errors.push({ field: "departureLocalTimeMinutes", code: "INVALID_LOCAL_TIME", message: "Departure time must be within a local day." });
  }
  if (input.scheduledDurationMinutes < 1 || input.scheduledDurationMinutes > 24 * 60) {
    errors.push({ field: "scheduledDurationMinutes", code: "INVALID_DURATION", message: "Duration must be between 1 minute and 24 hours." });
  }
  if (!parseIsoDate(input.effectiveFrom) || !parseIsoDate(input.from) || !parseIsoDate(input.to)) {
    errors.push({ field: "date", code: "INVALID_DATE", message: "Dates must use YYYY-MM-DD." });
  }
  return errors;
}

export function planScheduleOccurrences(input: ScheduleGenerationInput): PlannedOccurrence[] {
  const start = parseIsoDate(input.from);
  const end = parseIsoDate(input.to);
  const effectiveFrom = parseIsoDate(input.effectiveFrom);
  const effectiveUntil = input.effectiveUntil ? parseIsoDate(input.effectiveUntil) : null;
  if (!start || !end || !effectiveFrom || (input.effectiveUntil && !effectiveUntil)) return [];

  const results: PlannedOccurrence[] = [];
  for (let date = start; formatIsoDate(date) <= formatIsoDate(end); date = addLocalDays(date, 1)) {
    const operatingDate = formatIsoDate(date);
    if (operatingDate < formatIsoDate(effectiveFrom)) continue;
    if (effectiveUntil && operatingDate > formatIsoDate(effectiveUntil)) continue;
    if (!input.daysOfWeek.includes(localWeekday(date))) continue;

    const departure = resolveLocalDateTime(date, input.departureLocalTimeMinutes, input.departureTimezone);
    if (!departure.ok) {
      results.push({ ok: false, operatingDate, code: departure.code, message: departure.message });
      continue;
    }
    results.push({
      ok: true,
      operatingDate,
      scheduledDeparture: departure.instant,
      scheduledArrival: new Date(departure.instant.getTime() + input.scheduledDurationMinutes * 60_000),
    });
  }
  return results;
}
