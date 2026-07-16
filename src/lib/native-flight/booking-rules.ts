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
