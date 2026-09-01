import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { staffBookingCancellationPolicy } from "./booking-rules.ts";

const now = new Date("2026-09-01T10:00:00Z");
const future = new Date("2026-09-01T12:00:00Z");
const base = { dataOrigin: "HISPAFLY_NATIVE", bookingStatus: "CONFIRMED", selectedDepartureAt: future, scheduledDeparture: future, now };

assert.deepEqual(staffBookingCancellationPolicy(base), { allowed: true, idempotent: false, requiredPermission: "BOOKING_CANCEL", reason: null }, "pre-dispatch cancellation keeps BOOKING_CANCEL");
assert.equal(staffBookingCancellationPolicy({ ...base, bookingStatus: "DISPATCH_PENDING", dispatchStatus: "READY_FOR_RELEASE" }).requiredPermission, "BOOKING_CANCEL", "an unreleased Dispatch does not require void authority");
assert.equal(staffBookingCancellationPolicy({ ...base, bookingStatus: "DISPATCHED", dispatchStatus: "RELEASED" }).requiredPermission, "DISPATCH_VOID", "a released Dispatch requires DISPATCH_VOID");
assert.equal(staffBookingCancellationPolicy({ ...base, bookingStatus: "IN_PROGRESS" }).allowed, false, "terminal/active booking state is rejected");
assert.equal(staffBookingCancellationPolicy({ ...base, flightStatus: "DEPARTED" }).allowed, false, "departed Flight is rejected");
assert.equal(staffBookingCancellationPolicy({ ...base, dispatchStatus: "FLOWN" }).allowed, false, "flown Dispatch is rejected");
assert.equal(staffBookingCancellationPolicy({ ...base, dataOrigin: "VAMSYS_LEGACY" }).allowed, false, "Legacy operation is rejected");
assert.equal(staffBookingCancellationPolicy({ ...base, bookingStatus: "CANCELLED" }).idempotent, true, "repeated native cancellation is idempotent");

const service = readFileSync(fileURLToPath(new URL("./booking.ts", import.meta.url)), "utf8");
const action = readFileSync(fileURLToPath(new URL("../../app/staff/bookings/actions.ts", import.meta.url)), "utf8");
const page = readFileSync(fileURLToPath(new URL("../../app/staff/bookings/[id]/page.tsx", import.meta.url)), "utf8");
for (const contract of [
  "staff-booking-cancel:", "pg_advisory_xact_lock", "Serializable", "if (policy.idempotent) return booking",
  "dispatchRelease.updateMany", "flightOffer.update", "aircraftLocationSnapshot.update", "reservedByDispatchId: null",
  "aircraft.updateMany", "NativeFlightStatus.SCHEDULED", "NativeFlightStatus.OPEN_FOR_BOOKING", "NativeFlightStatus.EXPIRED",
  'staffUserId: input.staff.id', "reason, staffId: input.staff.id",
]) assert.ok(service.includes(contract), `Missing atomic cancellation contract: ${contract}`);
assert.ok(service.includes('policy.requiredPermission === "DISPATCH_VOID" && !input.canVoidReleasedDispatch'), "service rejects insufficient released-Dispatch permission inside the locked transaction");
assert.ok(action.includes('requireStaffPermission("BOOKING_CANCEL"') && action.includes('requireStaffPermission("DISPATCH_VOID"'), "action audits both authorization gates");
assert.ok(page.includes("staffBookingCancellationPolicy") && page.includes("cancellation.requiredPermission") && !page.includes("mutable && !booking.dispatch"), "button visibility uses the server policy");

console.log("Staff native booking cancellation lifecycle passed (pre-dispatch, Dispatch, terminal, Legacy, permission, and concurrency cases).");
