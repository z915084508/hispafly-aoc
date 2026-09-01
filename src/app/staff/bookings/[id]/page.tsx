import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentStaff } from "@/lib/staff/currentStaff";
import { staffHasPermission } from "@/lib/staff/permissions";
import { staffAssignBookingAircraftAction, staffCancelBookingAction } from "../actions";
import { staffBookingCancellationPolicy } from "@/lib/native-flight/booking-rules";
export default async function StaffBookingDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; success?: string }> }) {
  const [{ id }, query, staff] = await Promise.all([params, searchParams, getCurrentStaff()]);
  const [booking, aircraft] = await Promise.all([prisma.pilotBooking.findUnique({ where: { id }, include: { pilot: true, flight: true, route: true, fleet: true, aircraft: true, dispatch: true, matchedPirep: true } }), prisma.aircraft.findMany({ where: { operationalStatus: "AVAILABLE" }, orderBy: { registration: "asc" } })]);
  if (!booking) notFound();
  const mutable = booking.dataOrigin !== "VAMSYS_LEGACY" && !["COMPLETED","FLOWN","IN_PROGRESS"].includes(booking.status);
  const cancellation = staffBookingCancellationPolicy({ dataOrigin: booking.dataOrigin, bookingStatus: booking.status, selectedDepartureAt: booking.selectedDepartureAt, flightStatus: booking.flight?.status, scheduledDeparture: booking.flight?.scheduledDeparture, dispatchStatus: booking.dispatch?.status, hasMatchedPirep: Boolean(booking.matchedPirep) });
  const canCancel = cancellation.allowed && !cancellation.idempotent && staffHasPermission(staff, "BOOKING_CANCEL") && (cancellation.requiredPermission !== "DISPATCH_VOID" || staffHasPermission(staff, "DISPATCH_VOID"));
  return <><div className="page-header"><div><div className="eyebrow">{booking.dataOrigin === "VAMSYS_LEGACY" ? "LEGACY READ-ONLY" : "NATIVE BOOKING"}</div><h1>{booking.pilot.displayName} · {booking.flightNumber}</h1><p>{booking.departureIcao} → {booking.arrivalIcao} · {booking.status}</p></div></div>{query.error && <div className="notice">{query.error}</div>}{query.success && <div className="notice success">{query.success}</div>}<div className="detail-grid"><section><h2>Identity</h2><p>Booking: {booking.id}<br/>Flight: {booking.flightId ?? "Unresolved legacy"}<br/>Legacy: {booking.legacyReference ?? booking.vamsysBookingId ?? "None"}</p></section><section><h2>Resources</h2><p>Fleet: {booking.fleet?.code ?? "—"}<br/>Aircraft: {booking.aircraft?.registration ?? "Pending"}<br/>Dispatch: {booking.dispatch?.status ?? "Not started"}</p></section><section><h2>Timeline</h2><p>Booked: {booking.bookedAt.toISOString()}<br/>Cancelled: {booking.cancelledAt?.toISOString() ?? "—"}<br/>Reason: {booking.cancellationReason ?? "—"}</p></section></div>
    {mutable && staffHasPermission(staff, "BOOKING_ASSIGN_AIRCRAFT") && <form action={staffAssignBookingAircraftAction} className="form-grid"><input type="hidden" name="bookingId" value={booking.id}/><label>Aircraft<select name="aircraftId" required>{aircraft.map((item) => <option key={item.id} value={item.id}>{item.registration}</option>)}</select></label><label>Reason<input name="reason" required/></label><button className="button">Recheck and assign</button></form>}
    {canCancel && <form action={staffCancelBookingAction} className="form-grid"><input type="hidden" name="bookingId" value={booking.id}/><label>Cancellation reason<input name="reason" required/></label><button className="button danger">{booking.dispatch?.status === "RELEASED" ? "Cancel booking and void Dispatch" : "Cancel booking"}</button></form>}
  </>;
}
