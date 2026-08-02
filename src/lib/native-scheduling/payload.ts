import type { ProposedFlightSchedule } from "./types.ts";

type ParseResult = { ok: true; value: ProposedFlightSchedule } | { ok: false; error: string };
const optionalId = (value: unknown) => value === null || value === undefined || value === "" ? null : typeof value === "string" ? value : undefined;

export function parseScheduleValidationPayload(body: unknown): ParseResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "Request body must be a JSON object." };
  const row = body as Record<string, unknown>;
  const defaultFleetId = optionalId(row.defaultFleetId), assignedAircraftId = optionalId(row.assignedAircraftId);
  if (typeof row.routeId !== "string" || !row.routeId.trim()) return { ok: false, error: "routeId is required." };
  if (!Array.isArray(row.daysOfWeek) || row.daysOfWeek.some((day) => typeof day !== "number")) return { ok: false, error: "daysOfWeek must be an array of numbers." };
  if (typeof row.departureTimeMinutesUtc !== "number" || typeof row.arrivalTimeMinutesUtc !== "number" || typeof row.scheduledDurationMinutes !== "number") return { ok: false, error: "Departure, arrival and duration values must be numbers." };
  if (typeof row.effectiveFrom !== "string") return { ok: false, error: "effectiveFrom must be an ISO date string." };
  if (row.effectiveUntil !== null && row.effectiveUntil !== undefined && typeof row.effectiveUntil !== "string") return { ok: false, error: "effectiveUntil must be an ISO date string or null." };
  if (defaultFleetId === undefined || assignedAircraftId === undefined) return { ok: false, error: "Fleet and aircraft identifiers must be strings or null." };
  if (row.scheduleId !== undefined && typeof row.scheduleId !== "string") return { ok: false, error: "scheduleId must be a string when provided." };
  return { ok: true, value: { scheduleId: typeof row.scheduleId === "string" && row.scheduleId ? row.scheduleId : undefined, routeId: row.routeId.trim(), daysOfWeek: row.daysOfWeek, departureTimeMinutesUtc: row.departureTimeMinutesUtc, arrivalTimeMinutesUtc: row.arrivalTimeMinutesUtc, scheduledDurationMinutes: row.scheduledDurationMinutes, defaultFleetId, assignedAircraftId, effectiveFrom: new Date(row.effectiveFrom), effectiveUntil: typeof row.effectiveUntil === "string" ? new Date(row.effectiveUntil) : null, bookingOpenOffsetMinutes: typeof row.bookingOpenOffsetMinutes === "number" ? row.bookingOpenOffsetMinutes : 10080, bookingCloseOffsetMinutes: typeof row.bookingCloseOffsetMinutes === "number" ? row.bookingCloseOffsetMinutes : 60, generationHorizonDays: typeof row.generationHorizonDays === "number" ? row.generationHorizonDays : 30 } };
}
