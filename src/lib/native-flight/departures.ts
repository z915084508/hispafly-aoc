import { addLocalDays, formatIsoDate, isValidTimeZone, parseIsoDate, resolveLocalDateTime } from "./schedule-time.ts";

export const ACTIVE_SCHEDULED_BOOKING_STATUSES = ["PENDING", "CONFIRMED", "BOOKED", "DISPATCH_PENDING", "DISPATCHED", "IN_PROGRESS"] as const;
export type DepartureAvailability = "AVAILABLE" | "MY_BOOKING" | "RESERVED" | "UPCOMING" | "CLOSED" | "CANCELLED" | "FINISHED" | "WRONG_AIRPORT";

export function airportToday(timeZone: string, now = new Date()) {
  const zone = isValidTimeZone(timeZone) ? timeZone : "UTC";
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function airportLocalDay(value: string | undefined, requestedTimeZone: string, now = new Date()) {
  const fallback = !isValidTimeZone(requestedTimeZone);
  const timeZone = fallback ? "UTC" : requestedTimeZone;
  const selected = (value && parseIsoDate(value)) || parseIsoDate(airportToday(timeZone, now))!;
  const next = addLocalDays(selected, 1);
  const start = resolveLocalDateTime(selected, 0, timeZone);
  const end = resolveLocalDateTime(next, 0, timeZone);
  if (!start.ok || !end.ok) throw new Error("Unable to resolve the airport local day.");
  return { date: formatIsoDate(selected), previous: formatIsoDate(addLocalDays(selected, -1)), next: formatIsoDate(next), startUtc: start.instant, endUtc: end.instant, timeZone, fallback };
}

export function deriveDepartureAvailability(input: {
  status: string; bookingOpenAt: Date | null; bookingCloseAt: Date | null; scheduledDeparture: Date;
  pilotId: string; currentAirportId: string | null; departureAirportId: string | null;
  activeBookings: { id: string; pilotId: string }[]; now?: Date;
}): { state: DepartureAvailability; bookingId?: string } {
  const now = input.now ?? new Date();
  const own = input.activeBookings.find((booking) => booking.pilotId === input.pilotId);
  if (own) return { state: "MY_BOOKING", bookingId: own.id };
  if (input.activeBookings.length) return { state: "RESERVED" };
  if (input.status === "CANCELLED") return { state: "CANCELLED" };
  if (["COMPLETED", "DEPARTED", "AIRBORNE", "LANDED", "EXPIRED", "DIVERTED", "RETURNED"].includes(input.status) || input.scheduledDeparture <= now) return { state: "FINISHED" };
  if (input.bookingOpenAt && input.bookingOpenAt > now) return { state: "UPCOMING" };
  if (input.bookingCloseAt && input.bookingCloseAt <= now) return { state: "CLOSED" };
  if (!input.currentAirportId || input.currentAirportId !== input.departureAirportId) return { state: "WRONG_AIRPORT" };
  return ["SCHEDULED", "OPEN", "OPEN_FOR_BOOKING"].includes(input.status) ? { state: "AVAILABLE" } : { state: "CLOSED" };
}
