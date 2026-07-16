import { normalizeCode, normalizeIata, normalizeIcao } from "./normalize.ts";

export const ROUTE_DURATION_MAX_MINUTES = 24 * 60;

export function normalizeOptionalCode(value: string | null | undefined, label: string) {
  return value?.trim() ? normalizeCode(value, label) : null;
}

export function validateTimezone(value: string | null | undefined) {
  if (!value?.trim()) return null;
  const timezone = value.trim();
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
  } catch {
    throw new Error("Timezone must be a valid IANA timezone.");
  }
  return timezone;
}

export function validateCoordinate(value: number | null | undefined, kind: "latitude" | "longitude") {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const limit = kind === "latitude" ? 90 : 180;
  if (value < -limit || value > limit) throw new Error(`${kind === "latitude" ? "Latitude" : "Longitude"} is outside its valid range.`);
  return value;
}

export function validateAirportInput(input: {
  icao: string; iata?: string | null; timezone?: string | null;
  latitude?: number | null; longitude?: number | null;
}) {
  return {
    icao: normalizeIcao(input.icao),
    iata: normalizeIata(input.iata),
    timezone: validateTimezone(input.timezone),
    latitude: validateCoordinate(input.latitude, "latitude"),
    longitude: validateCoordinate(input.longitude, "longitude"),
  };
}

export function validateEffectivePeriod(from?: Date | null, until?: Date | null) {
  if (from && Number.isNaN(from.getTime())) throw new Error("Effective from date is invalid.");
  if (until && Number.isNaN(until.getTime())) throw new Error("Effective until date is invalid.");
  if (from && until && until < from) throw new Error("Effective until cannot be earlier than effective from.");
}

export function validateDuration(minutes?: number | null) {
  if (minutes === null || minutes === undefined || Number.isNaN(minutes)) return null;
  if (!Number.isInteger(minutes) || minutes <= 0 || minutes > ROUTE_DURATION_MAX_MINUTES) {
    throw new Error(`Estimated duration must be between 1 and ${ROUTE_DURATION_MAX_MINUTES} minutes.`);
  }
  return minutes;
}

export function periodsOverlap(
  aFrom?: Date | null, aUntil?: Date | null, bFrom?: Date | null, bUntil?: Date | null,
) {
  const startA = aFrom?.getTime() ?? Number.NEGATIVE_INFINITY;
  const endA = aUntil?.getTime() ?? Number.POSITIVE_INFINITY;
  const startB = bFrom?.getTime() ?? Number.NEGATIVE_INFINITY;
  const endB = bUntil?.getTime() ?? Number.POSITIVE_INFINITY;
  return startA <= endB && startB <= endA;
}

export function validateRouteBasics(input: {
  routeCode: string; flightNumber?: string | null; callsign?: string | null;
  departureAirportId: string; arrivalAirportId: string; durationMinutes?: number | null;
  effectiveFrom?: Date | null; effectiveUntil?: Date | null;
}) {
  if (input.departureAirportId === input.arrivalAirportId) {
    throw new Error("Departure and arrival airports must differ.");
  }
  validateEffectivePeriod(input.effectiveFrom, input.effectiveUntil);
  return {
    routeCode: normalizeCode(input.routeCode, "Route code"),
    flightNumber: normalizeOptionalCode(input.flightNumber, "Flight number"),
    callsign: normalizeOptionalCode(input.callsign, "Callsign"),
    durationMinutes: validateDuration(input.durationMinutes),
  };
}
