"use server";
import { redirect } from "next/navigation";
import { requireStaffPermission } from "@/lib/staff/authorization";
import { assignAircraftToFlight, cancelNativeFlight, createManualFlight } from "@/lib/native-flight/schedule";
import { writeAuditLogSafely } from "@/lib/audit/log";
const value = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const minutes = (text: string) => { const match = /^(\d{2}):(\d{2})$/.exec(text); return match ? Number(match[1]) * 60 + Number(match[2]) : -1; };
export async function createManualFlightAction(form: FormData) {
  const staff = await requireStaffPermission("FLIGHT_CREATE", { entityType: "Flight", attemptedAction: "create manual native flight" });
  let target = "/staff/flights/new";
  try {
    const flight = await createManualFlight({ routeId: value(form, "routeId"), operatingDate: value(form, "operatingDate"), departureLocalTimeMinutes: minutes(value(form, "departureTime")), departureTimezone: value(form, "departureTimezone"), arrivalTimezone: value(form, "arrivalTimezone"), scheduledDurationMinutes: Number(value(form, "duration")), fleetId: value(form, "fleetId") || null, assignedAircraftId: value(form, "aircraftId") || null, notes: value(form, "notes") || null });
    await writeAuditLogSafely({ staffUserId: staff.id, action: "FLIGHT_CREATED_MANUALLY", entityType: "Flight", entityId: flight.id, message: `${staff.name} created native flight ${flight.flightNumber}.` });
    target = `/staff/flights/${flight.id}?success=Flight+created`;
  } catch (error) { target += `?error=${encodeURIComponent(error instanceof Error ? error.message : "Creation failed")}`; }
  redirect(target);
}
export async function assignAircraftAction(form: FormData) {
  const flightId = value(form, "flightId");
  const staff = await requireStaffPermission("FLIGHT_ASSIGN", { entityType: "Flight", entityId: flightId, attemptedAction: "assign aircraft" });
  let target = `/staff/flights/${flightId}`;
  try { await assignAircraftToFlight(flightId, value(form, "aircraftId")); await writeAuditLogSafely({ staffUserId: staff.id, action: "FLIGHT_AIRCRAFT_ASSIGNED", entityType: "Flight", entityId: flightId, message: `${staff.name} assigned an aircraft.` }); target += "?success=Aircraft+assigned"; }
  catch (error) { target += `?error=${encodeURIComponent(error instanceof Error ? error.message : "Assignment failed")}`; }
  redirect(target);
}
export async function cancelFlightAction(form: FormData) {
  const flightId = value(form, "flightId");
  const staff = await requireStaffPermission("FLIGHT_CANCEL", { entityType: "Flight", entityId: flightId, attemptedAction: "cancel native flight" });
  let target = `/staff/flights/${flightId}`;
  try { await cancelNativeFlight(flightId, value(form, "reason") || "Cancelled by Operations"); await writeAuditLogSafely({ staffUserId: staff.id, action: "FLIGHT_CANCELLED", entityType: "Flight", entityId: flightId, message: `${staff.name} cancelled a native flight.` }); target += "?success=Flight+cancelled"; }
  catch (error) { target += `?error=${encodeURIComponent(error instanceof Error ? error.message : "Cancellation failed")}`; }
  redirect(target);
}
