"use server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireStaffPermission } from "@/lib/staff/authorization";
import { checkAircraftAvailability } from "@/lib/native-flight/availability";
import { writeAuditLogSafely } from "@/lib/audit/log";
const value = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
export async function staffCancelBookingAction(form: FormData) {
  const id = value(form, "bookingId"), reason = value(form, "reason");
  const staff = await requireStaffPermission("BOOKING_CANCEL", { entityType: "PilotBooking", entityId: id, attemptedAction: "cancel booking" });
  let target = `/staff/bookings/${id}`;
  try {
    if (!reason) throw new Error("A cancellation reason is required.");
    const booking = await prisma.pilotBooking.findUnique({ where: { id }, include: { dispatch: true } });
    if (!booking) throw new Error("Booking not found.");
    if (booking.dataOrigin === "VAMSYS_LEGACY") throw new Error("Legacy booking is read-only.");
    if (["COMPLETED","FLOWN","IN_PROGRESS"].includes(booking.status)) throw new Error("Historical or active booking cannot be directly cancelled.");
    if (booking.dispatch) throw new Error("Dispatch-controlled cancellation belongs to TASK 5.6.");
    await prisma.pilotBooking.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancellationReason: reason } });
    await writeAuditLogSafely({ staffUserId: staff.id, action: "STAFF_BOOKING_CANCELLED", entityType: "PilotBooking", entityId: id, message: `${staff.name} cancelled a native booking.`, metadata: { reason } });
    target += "?success=Booking+cancelled";
  } catch (error) { target += `?error=${encodeURIComponent(error instanceof Error ? error.message : "Cancellation failed")}`; }
  redirect(target);
}
export async function staffAssignBookingAircraftAction(form: FormData) {
  const id = value(form, "bookingId"), aircraftId = value(form, "aircraftId"), reason = value(form, "reason");
  const staff = await requireStaffPermission("BOOKING_ASSIGN_AIRCRAFT", { entityType: "PilotBooking", entityId: id, attemptedAction: "reassign booking aircraft" });
  let target = `/staff/bookings/${id}`;
  try {
    if (!reason) throw new Error("A reassignment reason is required.");
    const booking = await prisma.pilotBooking.findUnique({ where: { id } });
    if (!booking || !booking.flightId) throw new Error("Native Flight relationship is required.");
    if (booking.dataOrigin === "VAMSYS_LEGACY" || ["COMPLETED","FLOWN","IN_PROGRESS"].includes(booking.status)) throw new Error("This booking is immutable.");
    const flight = await prisma.flight.findUnique({ where: { id: booking.flightId } });
    if (!flight) throw new Error("Flight not found.");
    const availability = await checkAircraftAvailability({ aircraftId, routeId: flight.routeId, departureAirportId: flight.departureAirportId, startsAt: flight.scheduledDeparture, endsAt: flight.scheduledArrival });
    if (!availability.allowed) throw new Error(availability.blockingReasons.join(" "));
    await prisma.pilotBooking.update({ where: { id }, data: { aircraftId } });
    await writeAuditLogSafely({ staffUserId: staff.id, action: "STAFF_BOOKING_AIRCRAFT_CHANGED", entityType: "PilotBooking", entityId: id, message: `${staff.name} changed booking aircraft.`, metadata: { aircraftId, reason, warnings: availability.warnings } });
    target += "?success=Aircraft+updated";
  } catch (error) { target += `?error=${encodeURIComponent(error instanceof Error ? error.message : "Assignment failed")}`; }
  redirect(target);
}
