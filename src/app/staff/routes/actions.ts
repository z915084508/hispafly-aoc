"use server";
import { redirect } from "next/navigation";
import { requireStaffPermission } from "@/lib/staff/authorization";
import { createAndPublishRoute, syncVamsysRoutes, updateAndPublishRoute } from "@/lib/vamsys/routes/service";
import { validateRouteForm } from "@/lib/vamsys/routes/validation";
import { prisma } from "@/lib/prisma";
import { nextRouteIdentity } from "@/lib/vamsys/routes/planning";

export async function suggestRouteIdentityAction() {
  await requireStaffPermission("ROUTE_CREATE", { entityType: "Route", attemptedAction: "generate route identity" });
  const [routes, reservations] = await Promise.all([
    prisma.route.findMany({ select: { flightNumber: true, callsign: true } }),
    prisma.routeIdentityReservation.findMany({ select: { flightNumber: true, callsign: true } }),
  ]);
  return nextRouteIdentity([...routes, ...reservations]);
}

export async function syncRoutesAction() {
  let target: string;
  try { const staff = await requireStaffPermission("ROUTE_SYNC", { entityType: "Route", attemptedAction: "synchronize routes" }); const result = await syncVamsysRoutes(staff); target = `/staff/routes?success=${encodeURIComponent(`Synchronized: ${result.imported} imported, ${result.updated} updated, ${result.missing} missing`)}`; }
  catch (error) { target = `/staff/routes?error=${encodeURIComponent(error instanceof Error ? error.message : "Route synchronization failed.")}`; }
  redirect(target);
}
export async function createAndPublishRouteAction(formData: FormData) {
  let target: string;
  try { const staff = await requireStaffPermission("ROUTE_CREATE", { entityType: "Route", attemptedAction: "create and publish route" }); const route = await createAndPublishRoute(validateRouteForm(formData), staff); target = `/staff/routes/${route.id}?success=${encodeURIComponent("Route published successfully.")}`; }
  catch (error) { target = `/staff/routes/new?error=${encodeURIComponent(error instanceof Error ? error.message : "Route publication failed.")}`; }
  redirect(target);
}
export async function updateAndPublishRouteAction(formData: FormData) {
  const id = String(formData.get("id") ?? ""); let target: string;
  try { const staff = await requireStaffPermission("ROUTE_EDIT", { entityType: "Route", entityId: id, attemptedAction: "update route" }); const route = await updateAndPublishRoute(validateRouteForm(formData), staff); target = `/staff/routes/${route.id}?success=${encodeURIComponent("Route updated successfully.")}`; }
  catch (error) { target = `/staff/routes/${id}/edit?error=${encodeURIComponent(error instanceof Error ? error.message : "Route update failed.")}`; }
  redirect(target);
}
