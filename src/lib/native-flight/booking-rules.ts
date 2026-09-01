export const NATIVE_BOOKABLE_FLIGHT_STATUSES = new Set(["SCHEDULED", "OPEN", "OPEN_FOR_BOOKING"]);
export const PILOT_CANCELLABLE_BOOKING_STATUSES = new Set(["PENDING", "CONFIRMED", "BOOKED"]);
export function bookingWindowAllows(input: { now: Date; departure: Date; opensAt?: Date | null; closesAt?: Date | null }) {
  const blockingReasons: string[] = [];
  if (input.departure <= input.now) blockingReasons.push("Flight departure has passed.");
  if (input.opensAt && input.opensAt > input.now) blockingReasons.push("Booking window has not opened.");
  if (input.closesAt && input.closesAt <= input.now) blockingReasons.push("Booking window has closed.");
  return { allowed: blockingReasons.length === 0, blockingReasons };
}
export function canPilotCancelBooking(status: string, hasDispatch: boolean, legacy: boolean) {
  return !legacy && !hasDispatch && PILOT_CANCELLABLE_BOOKING_STATUSES.has(status);
}

const STAFF_CANCELLABLE_BOOKING_STATUSES = new Set(["PENDING", "CONFIRMED", "BOOKED", "DISPATCH_PENDING", "DISPATCHED"]);
const STAFF_TERMINAL_FLIGHT_STATUSES = new Set(["DEPARTED", "AIRBORNE", "IN_PROGRESS", "LANDED", "COMPLETED", "DIVERTED", "RETURNED", "CANCELLED"]);
const STAFF_TERMINAL_DISPATCH_STATUSES = new Set(["DISPATCHING", "DISPATCHED", "FLOWN", "REWARDED", "SUPERSEDED", "VOIDED", "CANCELLED", "EXPIRED"]);

export type StaffCancellationPermission = "BOOKING_CANCEL" | "DISPATCH_VOID";

export function staffBookingCancellationPolicy(input: {
  dataOrigin: string;
  bookingStatus: string;
  selectedDepartureAt: Date;
  flightStatus?: string | null;
  scheduledDeparture?: Date | null;
  dispatchStatus?: string | null;
  hasMatchedPirep?: boolean;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  if (input.dataOrigin === "VAMSYS_LEGACY") return { allowed: false, idempotent: false, requiredPermission: "BOOKING_CANCEL" as const, reason: "Legacy bookings are read-only." };
  if (input.bookingStatus === "CANCELLED") return { allowed: true, idempotent: true, requiredPermission: "BOOKING_CANCEL" as const, reason: null };
  if (!STAFF_CANCELLABLE_BOOKING_STATUSES.has(input.bookingStatus)) return { allowed: false, idempotent: false, requiredPermission: "BOOKING_CANCEL" as const, reason: "Departed, in-progress, flown, and completed operations cannot be cancelled." };
  if (input.hasMatchedPirep || (input.flightStatus && STAFF_TERMINAL_FLIGHT_STATUSES.has(input.flightStatus)) || (input.dispatchStatus && STAFF_TERMINAL_DISPATCH_STATUSES.has(input.dispatchStatus))) {
    return { allowed: false, idempotent: false, requiredPermission: "BOOKING_CANCEL" as const, reason: "Departed, in-progress, flown, and completed operations cannot be cancelled." };
  }
  if ((input.scheduledDeparture ?? input.selectedDepartureAt) <= now) return { allowed: false, idempotent: false, requiredPermission: "BOOKING_CANCEL" as const, reason: "A departed operation cannot be cancelled." };
  return { allowed: true, idempotent: false, requiredPermission: input.dispatchStatus === "RELEASED" ? "DISPATCH_VOID" as const : "BOOKING_CANCEL" as const, reason: null };
}
