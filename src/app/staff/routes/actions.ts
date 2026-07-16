"use server";
import type { RouteOperationalStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { changeRouteStatus, copyRouteToNativeDraft, createNativeRoute, updateNativeRoute } from "@/lib/native-flight/route";
import { requireStaffPermission } from "@/lib/staff/authorization";

const value = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const optionalNumber = (form: FormData, key: string) => value(form, key) === "" ? null : Number(value(form, key));
const optionalDate = (form: FormData, key: string) => value(form, key) ? new Date(`${value(form, key)}T00:00:00.000Z`) : null;
function routeInput(form: FormData) {
  return {
    routeCode: value(form, "routeCode"), flightNumber: value(form, "flightNumber"),
    callsign: value(form, "callsign"), departureAirportId: value(form, "departureAirportId"),
    arrivalAirportId: value(form, "arrivalAirportId"), defaultFleetId: value(form, "defaultFleetId") || null,
    durationMinutes: optionalNumber(form, "durationMinutes"), cruiseAltitude: optionalNumber(form, "cruiseAltitude"),
    route: value(form, "route"), networkPolicy: value(form, "networkPolicy"),
    effectiveFrom: optionalDate(form, "effectiveFrom"), effectiveUntil: optionalDate(form, "effectiveUntil"),
    internalNotes: value(form, "internalNotes"), overrideConflicts: value(form, "overrideConflicts") === "yes",
    overrideReason: value(form, "overrideReason"),
  };
}
export async function createRouteAction(form: FormData) {
  let target = "/staff/routes/new";
  try {
    const staff = await requireStaffPermission("ROUTE_CREATE", { entityType: "Route", attemptedAction: "create Native route" });
    const route = await createNativeRoute(routeInput(form), staff);
    target = `/staff/routes/${route.id}?success=Native%20route%20created.`;
  } catch (error) { target += `?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to create route.")}`; }
  redirect(target);
}
export async function updateRouteAction(form: FormData) {
  const id = value(form, "id"); let target = `/staff/routes/${id}/edit`;
  try {
    const staff = await requireStaffPermission("ROUTE_EDIT", { entityType: "Route", entityId: id, attemptedAction: "edit Native route" });
    await updateNativeRoute(id, routeInput(form), staff); revalidatePath("/staff/routes");
    target = `/staff/routes/${id}?success=Route%20updated.`;
  } catch (error) { target += `?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to update route.")}`; }
  redirect(target);
}
export async function changeRouteStatusAction(form: FormData) {
  const id = value(form, "id"), status = value(form, "status") as RouteOperationalStatus;
  let target = `/staff/routes/${id}`;
  try {
    const permission = status === "ARCHIVED" ? "ROUTE_ARCHIVE" : "ROUTE_EDIT";
    const staff = await requireStaffPermission(permission, { entityType: "Route", entityId: id, attemptedAction: `${status.toLowerCase()} route` });
    await changeRouteStatus(id, status, staff, value(form, "reason")); revalidatePath("/staff/routes");
    target += "?success=Route%20status%20updated.";
  } catch (error) { target += `?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to change route status.")}`; }
  redirect(target);
}
export async function copyRouteAction(form: FormData) {
  const id = value(form, "id"); let target = `/staff/routes/${id}`;
  try {
    const staff = await requireStaffPermission("ROUTE_CREATE", { entityType: "Route", entityId: id, attemptedAction: "copy route to Native draft" });
    const copy = await copyRouteToNativeDraft(id, { routeCode: value(form, "routeCode"), overrideConflicts: value(form, "overrideConflicts") === "yes", overrideReason: value(form, "overrideReason") }, staff);
    target = `/staff/routes/${copy.id}?success=Native%20draft%20created.`;
  } catch (error) { target += `?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to copy route.")}`; }
  redirect(target);
}
