import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { StaffIdentity } from "@/lib/staff/currentStaff";
import { VamsysOperationsError } from "@/lib/vamsys/operations";
import { createVamsysRoute, getVamsysRoute, listAllVamsysRoutes, updateVamsysRoute } from "./client";
import { externalRouteToPrisma, formToVamsysPayload } from "./mapper";
import type { RouteFormInput } from "./types";

const rawRecord = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const externalId = (raw: unknown) => { const row = rawRecord(raw); const id = row?.id ?? row?.airport_id; return typeof id === "number" || typeof id === "string" ? String(id) : null; };

async function references() {
  const [airports, fleets] = await Promise.all([prisma.airport.findMany(), prisma.fleet.findMany()]);
  const airportsByExternal = new Map<string, string>(), airportByIcao = new Map<string, { id: number }>();
  for (const airport of airports) { const id = externalId(airport.rawData); if (id && /^\d+$/.test(id)) { airportsByExternal.set(id, airport.icao); airportByIcao.set(airport.icao, { id: Number(id) }); } }
  return { airportsByExternal, airportByIcao, fleetByExternal: new Map(fleets.map(f => [f.vamsysFleetId, f])), fleetByLocal: new Map(fleets.map(f => [f.id, f])) };
}

async function replaceFleetAssignments(routeId: string, vamsysRouteId: string | null, ids: number[], refs: Awaited<ReturnType<typeof references>>) {
  const known = ids.map(String).map(id => refs.fleetByExternal.get(id)).filter(Boolean) as Array<{ id: string; vamsysFleetId: string }>;
  await prisma.$transaction([
    prisma.routeFleetAssignment.deleteMany({ where: { routeId } }),
    ...known.map(fleet => prisma.routeFleetAssignment.create({ data: { routeId, fleetId: fleet.id, vamsysRouteId, vamsysFleetId: fleet.vamsysFleetId } })),
  ]);
  return ids.filter(id => !refs.fleetByExternal.has(String(id)));
}

export async function syncVamsysRoutes(staff: StaffIdentity) {
  const startedAt = new Date();
  await prisma.aocAuditLog.create({ data: { staffUserId: staff.id === "development-staff" ? null : staff.id, action: "VAMSYS_ROUTE_SYNC_STARTED", entityType: "Route", message: "Route synchronization started." } });
  let imported = 0, updated = 0, unchanged = 0, missing = 0, failed = 0;
  try {
    const [external, refs, existing] = await Promise.all([listAllVamsysRoutes(), references(), prisma.route.findMany({ where: { vamsysRouteId: { not: null } } })]);
    const seen = new Set<string>();
    for (const item of external) {
      try {
        const id = String(item.id); seen.add(id);
        const before = existing.find(route => route.vamsysRouteId === id);
        const data = externalRouteToPrisma(item, refs.airportsByExternal);
        const route = await prisma.route.upsert({ where: { vamsysRouteId: id }, create: data, update: data });
        const unknown = await replaceFleetAssignments(route.id, id, item.fleet_ids ?? [], refs);
        if (unknown.length) await prisma.route.update({ where: { id: route.id }, data: { lastSyncError: `Unknown vAMSYS fleet IDs: ${unknown.join(", ")}` } });
        if (!before) imported++; else if (before.sourceUpdatedAt?.getTime() !== data.sourceUpdatedAt?.getTime()) updated++; else unchanged++;
      } catch { failed++; }
    }
    const missingIds = existing.filter(route => route.vamsysRouteId && !seen.has(route.vamsysRouteId)).map(route => route.id);
    if (missingIds.length) { const result = await prisma.route.updateMany({ where: { id: { in: missingIds }, syncStatus: { not: "LOCAL_DRAFT" } }, data: { syncStatus: "MISSING", active: false } }); missing = result.count; }
    await prisma.operationsApiState.upsert({ where: { id: "vamsys" }, create: { id: "vamsys", lastRouteSyncAt: startedAt, lastRouteSyncStatus: failed ? "degraded" : "success", lastRouteSyncImported: imported, lastRouteSyncUpdated: updated, lastRouteSyncMissing: missing, lastRouteSyncError: failed ? `${failed} route(s) failed` : null }, update: { lastRouteSyncAt: startedAt, lastRouteSyncStatus: failed ? "degraded" : "success", lastRouteSyncImported: imported, lastRouteSyncUpdated: updated, lastRouteSyncMissing: missing, lastRouteSyncError: failed ? `${failed} route(s) failed` : null } });
    await prisma.aocAuditLog.create({ data: { staffUserId: staff.id === "development-staff" ? null : staff.id, action: "VAMSYS_ROUTE_SYNC_COMPLETED", entityType: "Route", message: "Route synchronization completed.", metadata: { imported, updated, unchanged, missing, failed } } });
    revalidatePath("/staff/routes"); revalidatePath("/staff/flight-offers");
    return { imported, updated, unchanged, missing, failed };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Route synchronization failed.";
    await prisma.operationsApiState.upsert({ where: { id: "vamsys" }, create: { id: "vamsys", lastRouteSyncAt: startedAt, lastRouteSyncStatus: "failed", lastRouteSyncError: message.slice(0, 500) }, update: { lastRouteSyncAt: startedAt, lastRouteSyncStatus: "failed", lastRouteSyncError: message.slice(0, 500) } });
    await prisma.aocAuditLog.create({ data: { staffUserId: staff.id === "development-staff" ? null : staff.id, action: "VAMSYS_ROUTE_SYNC_FAILED", entityType: "Route", message } });
    throw error;
  }
}

async function validateReferences(input: RouteFormInput) {
  const refs = await references();
  const departure = refs.airportByIcao.get(input.departureIcao), arrival = refs.airportByIcao.get(input.arrivalIcao);
  if (!departure || !arrival) throw new Error("Departure and arrival must be synchronized vAMSYS airports.");
  const fleets = input.fleetIds.map(id => refs.fleetByLocal.get(id));
  if (fleets.some(fleet => !fleet?.vamsysFleetId)) throw new Error("Unknown or unpublished fleet selection.");
  return { refs, departureId: departure.id, arrivalId: arrival.id, fleetIds: fleets.map(fleet => Number(fleet!.vamsysFleetId)) };
}

export async function createAndPublishRoute(input: RouteFormInput, staff: StaffIdentity) {
  const { refs, departureId, arrivalId, fleetIds } = await validateReferences(input);
  const duplicate = await prisma.route.findFirst({ where: { OR: [{ flightNumber: input.flightNumber }, { callsign: input.callsign }] }, select: { id: true } });
  if (duplicate) throw new Error("Flight number or callsign is already in use. Generate another identity.");
  const local = await prisma.$transaction(async tx => {
    const route = await tx.route.create({ data: { departure: input.departureIcao, arrival: input.arrivalIcao, flightNumber: input.flightNumber, callsign: input.callsign, route: input.route, scheduledDurationMinutes: input.durationMinutes, distanceNm: input.distanceNm, cruiseAltitude: input.altitude, costIndex: input.costIndex && /^\d+$/.test(input.costIndex) ? Number(input.costIndex) : null, operationalStatus: input.hidden ? "HIDDEN" : "DRAFT", syncStatus: "PUBLISHING", active: !input.hidden, internalNotes: input.internalNotes } });
    await tx.routeIdentityReservation.create({ data: { routeId: route.id, flightNumber: input.flightNumber, callsign: input.callsign } });
    return route;
  });
  try {
    const external = await createVamsysRoute(formToVamsysPayload(input, departureId, arrivalId, fleetIds, true));
    const mapped = externalRouteToPrisma(external, refs.airportsByExternal);
    const route = await prisma.route.update({ where: { id: local.id }, data: { ...mapped, lastPublishedAt: new Date(), internalNotes: input.internalNotes } });
    await replaceFleetAssignments(route.id, route.vamsysRouteId, external.fleet_ids ?? [], refs);
    await prisma.aocAuditLog.create({ data: { staffUserId: staff.id === "development-staff" ? null : staff.id, action: "VAMSYS_ROUTE_CREATED", entityType: "Route", entityId: route.id, message: `${input.flightNumber} published to vAMSYS.`, metadata: { vamsysRouteId: route.vamsysRouteId, departure: input.departureIcao, arrival: input.arrivalIcao } } });
    return route;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Route publication failed.";
    await prisma.route.update({ where: { id: local.id }, data: { syncStatus: "SYNC_ERROR", lastSyncError: message.slice(0, 500) } });
    await prisma.aocAuditLog.create({ data: { staffUserId: staff.id === "development-staff" ? null : staff.id, action: "VAMSYS_ROUTE_CREATE_FAILED", entityType: "Route", entityId: local.id, message, metadata: error instanceof VamsysOperationsError ? { status: error.status, code: error.code, uncertain: error.uncertain } : undefined } });
    throw error;
  }
}

export async function updateAndPublishRoute(input: RouteFormInput, staff: StaffIdentity) {
  if (!input.localId) throw new Error("Missing local route ID.");
  const current = await prisma.route.findUnique({ where: { id: input.localId } });
  if (!current?.vamsysRouteId) throw new Error("Only published routes can be updated.");
  const duplicate = await prisma.route.findFirst({ where: { id: { not: current.id }, OR: [{ flightNumber: input.flightNumber }, { callsign: input.callsign }] }, select: { id: true } });
  if (duplicate) throw new Error("Flight number or callsign is already in use.");
  await prisma.routeIdentityReservation.upsert({ where: { routeId: current.id }, create: { routeId: current.id, flightNumber: input.flightNumber, callsign: input.callsign }, update: { flightNumber: input.flightNumber, callsign: input.callsign } });
  const { refs, departureId, arrivalId, fleetIds } = await validateReferences(input);
  const latest = await getVamsysRoute(current.vamsysRouteId);
  if (current.lastSyncedAt && latest.updated_at && new Date(latest.updated_at) > current.lastSyncedAt) throw new Error("vAMSYS contains a newer route update. Synchronize before editing.");
  const external = await updateVamsysRoute(current.vamsysRouteId, formToVamsysPayload(input, departureId, arrivalId, fleetIds, false));
  const mapped = externalRouteToPrisma(external, refs.airportsByExternal);
  const route = await prisma.route.update({ where: { id: current.id }, data: { ...mapped, internalNotes: input.internalNotes } });
  await replaceFleetAssignments(route.id, route.vamsysRouteId, external.fleet_ids ?? [], refs);
  await prisma.aocAuditLog.create({ data: { staffUserId: staff.id === "development-staff" ? null : staff.id, action: "VAMSYS_ROUTE_UPDATED", entityType: "Route", entityId: route.id, message: `${input.flightNumber} updated in vAMSYS.` } });
  return route;
}
