import type { Prisma, RouteOperationalStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { StaffIdentity } from "@/lib/staff/currentStaff";
import type { NativeOrigin } from "./airport";
import { periodsOverlap, validateRouteBasics } from "./management-rules";

const actorId = (actor: StaffIdentity) => actor.id === "development-staff" ? null : actor.id;
const nativeOrigins = new Set(["HISPAFLY_NATIVE", "IMPORTED", "MANUAL"]);
const includes = { departureAirport: true, arrivalAirport: true, defaultFleet: true } as const;

export const findRouteById = (id: string) => prisma.route.findUnique({
  where: { id }, include: { ...includes, fleetAssignments: { include: { fleet: true } }, _count: { select: { schedules: true, flights: true, nativeBookings: true, nativeDispatches: true } } },
});

export async function listRoutes(input: {
  search?: string; status?: RouteOperationalStatus; dataOrigin?: string; departureAirportId?: string;
  arrivalAirportId?: string; fleetId?: string; page?: number; pageSize?: number;
}) {
  const page = Math.max(1, input.page ?? 1), pageSize = Math.min(100, Math.max(1, input.pageSize ?? 25));
  const search = input.search?.trim();
  const where: Prisma.RouteWhereInput = {
    ...(search ? { OR: [
      { routeCode: { contains: search, mode: "insensitive" } }, { flightNumber: { contains: search, mode: "insensitive" } },
      { departure: { contains: search.toUpperCase() } }, { arrival: { contains: search.toUpperCase() } },
    ] } : {}),
    ...(input.status ? { operationalStatus: input.status } : {}),
    ...(input.dataOrigin ? { dataOrigin: input.dataOrigin as never } : {}),
    ...(input.departureAirportId ? { departureAirportId: input.departureAirportId } : {}),
    ...(input.arrivalAirportId ? { arrivalAirportId: input.arrivalAirportId } : {}),
    ...(input.fleetId ? { defaultFleetId: input.fleetId } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.route.findMany({ where, include: includes, orderBy: { updatedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.route.count({ where }),
  ]);
  return { rows, total, page, pageSize };
}

export type NativeRouteInput = {
  routeCode: string; departureAirportId: string; arrivalAirportId: string;
  flightNumber?: string | null; callsign?: string | null; defaultFleetId?: string | null;
  durationMinutes?: number | null; cruiseAltitude?: number | null; route?: string | null;
  networkPolicy?: string | null; effectiveFrom?: Date | null; effectiveUntil?: Date | null;
  internalNotes?: string | null; dataOrigin?: NativeOrigin; overrideConflicts?: boolean; overrideReason?: string;
};

async function validateReferences(tx: Prisma.TransactionClient, input: NativeRouteInput) {
  const basics = validateRouteBasics(input);
  const [departure, arrival, fleet] = await Promise.all([
    tx.airport.findUnique({ where: { id: input.departureAirportId } }),
    tx.airport.findUnique({ where: { id: input.arrivalAirportId } }),
    input.defaultFleetId ? tx.fleet.findUnique({ where: { id: input.defaultFleetId } }) : null,
  ]);
  if (!departure || !arrival) throw new Error("Route airports do not exist.");
  if (departure.status !== "ACTIVE" || arrival.status !== "ACTIVE") throw new Error("Archived or inactive airports cannot be assigned to a new route.");
  if (input.defaultFleetId && (!fleet || fleet.operationalStatus !== "ACTIVE" || fleet.dataOrigin === "VAMSYS_LEGACY")) throw new Error("Default fleet must be an active Native fleet.");
  return { basics, departure, arrival, fleet };
}

async function conflictWarnings(tx: Prisma.TransactionClient, input: NativeRouteInput, routeId?: string) {
  const basics = validateRouteBasics(input);
  const candidates = await tx.route.findMany({ where: {
    id: routeId ? { not: routeId } : undefined,
    operationalStatus: { not: "ARCHIVED" },
    OR: [
      { routeCode: basics.routeCode },
      ...(basics.flightNumber ? [{ flightNumber: basics.flightNumber }] : []),
      { departureAirportId: input.departureAirportId, arrivalAirportId: input.arrivalAirportId },
    ],
  }, select: { id: true, routeCode: true, flightNumber: true, departureAirportId: true, arrivalAirportId: true, effectiveFrom: true, effectiveUntil: true } });
  return candidates.filter((candidate) => periodsOverlap(input.effectiveFrom, input.effectiveUntil, candidate.effectiveFrom, candidate.effectiveUntil))
    .map((candidate) => `${candidate.routeCode ?? candidate.flightNumber ?? candidate.id} overlaps this route's identity, airport pair or effective period.`);
}

function routeData(input: NativeRouteInput, refs: Awaited<ReturnType<typeof validateReferences>>) {
  return {
    routeCode: refs.basics.routeCode, flightNumber: refs.basics.flightNumber, callsign: refs.basics.callsign,
    departure: refs.departure.icao, arrival: refs.arrival.icao,
    departureAirportId: refs.departure.id, arrivalAirportId: refs.arrival.id, defaultFleetId: refs.fleet?.id ?? null,
    scheduledDurationMinutes: refs.basics.durationMinutes, cruiseAltitude: input.cruiseAltitude ?? null,
    route: input.route?.trim().toUpperCase() || null, networkPolicy: input.networkPolicy?.trim() || null,
    effectiveFrom: input.effectiveFrom ?? null, effectiveUntil: input.effectiveUntil ?? null,
    internalNotes: input.internalNotes?.trim() || null,
  };
}

async function assertConflictOverride(warnings: string[], input: NativeRouteInput) {
  if (!warnings.length) return;
  if (!input.overrideConflicts) throw new Error(`Possible route conflict: ${warnings.join(" ")}`);
  if (!input.overrideReason?.trim()) throw new Error("A reason is required to override route conflict warnings.");
}

export async function createNativeRoute(input: NativeRouteInput, actor?: StaffIdentity) {
  return prisma.$transaction(async (tx) => {
    const refs = await validateReferences(tx, input), warnings = await conflictWarnings(tx, input);
    await assertConflictOverride(warnings, input);
    const route = await tx.route.create({ data: {
      ...routeData(input, refs), operationalStatus: "DRAFT", syncStatus: "LOCAL_DRAFT", active: true,
      dataOrigin: input.dataOrigin ?? "HISPAFLY_NATIVE",
    } });
    if (actor) {
      await tx.aocAuditLog.create({ data: {
        staffUserId: actorId(actor), action: "ROUTE_CREATED", entityType: "Route", entityId: route.id,
        message: `${actor.name} created Native route ${route.routeCode}.`, metadata: { warnings, overrideReason: input.overrideReason ?? null },
      } });
      if (warnings.length) await tx.aocAuditLog.create({ data: {
        staffUserId: actorId(actor), action: "ROUTE_CONFLICT_OVERRIDE_CONFIRMED", entityType: "Route", entityId: route.id,
        message: `${actor.name} confirmed route conflict warnings.`, metadata: { warnings, reason: input.overrideReason },
      } });
    }
    return route;
  }, { isolationLevel: "Serializable" });
}

export async function updateNativeRoute(id: string, input: NativeRouteInput, actor: StaffIdentity) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.route.findUnique({ where: { id } });
    if (!before) throw new Error("Route not found.");
    if (!nativeOrigins.has(before.dataOrigin)) throw new Error("Legacy routes are read-only. Copy this route to a Native draft first.");
    if (before.operationalStatus === "ARCHIVED") throw new Error("Archived routes are read-only.");
    const refs = await validateReferences(tx, input), warnings = await conflictWarnings(tx, input, id);
    await assertConflictOverride(warnings, input);
    const route = await tx.route.update({ where: { id }, data: routeData(input, refs) });
    await tx.aocAuditLog.create({ data: {
      staffUserId: actorId(actor), action: "ROUTE_UPDATED", entityType: "Route", entityId: id,
      message: `${actor.name} updated Native route ${route.routeCode}.`,
      metadata: { before: { routeCode: before.routeCode, flightNumber: before.flightNumber, status: before.operationalStatus }, after: routeData(input, refs), warnings, overrideReason: input.overrideReason ?? null },
    } });
    return route;
  }, { isolationLevel: "Serializable" });
}

export async function changeRouteStatus(id: string, status: RouteOperationalStatus, actor: StaffIdentity, reason: string) {
  if (!["DRAFT", "ACTIVE", "SUSPENDED", "ARCHIVED"].includes(status)) throw new Error("Unsupported Native route status.");
  if (!reason.trim()) throw new Error("A reason is required for route status changes.");
  return prisma.$transaction(async (tx) => {
    const before = await tx.route.findUnique({ where: { id }, include: includes });
    if (!before) throw new Error("Route not found.");
    if (!nativeOrigins.has(before.dataOrigin)) throw new Error("Legacy routes are read-only.");
    if (status === "ACTIVE") {
      if (!before.departureAirport || !before.arrivalAirport || before.departureAirport.status !== "ACTIVE" || before.arrivalAirport.status !== "ACTIVE") throw new Error("Both airports must be active before activating a route.");
      if (before.defaultFleet && (before.defaultFleet.operationalStatus !== "ACTIVE" || before.defaultFleet.dataOrigin === "VAMSYS_LEGACY")) throw new Error("The default fleet must be an active Native fleet.");
    }
    const route = await tx.route.update({ where: { id }, data: {
      operationalStatus: status, active: status === "ACTIVE" || status === "DRAFT",
      archivedAt: status === "ARCHIVED" ? new Date() : null,
    } });
    await tx.aocAuditLog.create({ data: {
      staffUserId: actorId(actor), action: status === "ARCHIVED" ? "ROUTE_ARCHIVED" : "ROUTE_STATUS_CHANGED",
      entityType: "Route", entityId: id, message: `${actor.name} changed ${route.routeCode} from ${before.operationalStatus} to ${status}.`,
      metadata: { before: before.operationalStatus, after: status, reason },
    } });
    return route;
  });
}

export async function copyRouteToNativeDraft(id: string, input: { routeCode: string; overrideConflicts?: boolean; overrideReason?: string }, actor: StaffIdentity) {
  const source = await prisma.route.findUnique({ where: { id } });
  if (!source) throw new Error("Route not found.");
  if (!source.departureAirportId || !source.arrivalAirportId) throw new Error("Legacy route must be mapped to internal airports before it can be copied.");
  const copy = await createNativeRoute({
    routeCode: input.routeCode, flightNumber: source.flightNumber, callsign: source.callsign,
    departureAirportId: source.departureAirportId, arrivalAirportId: source.arrivalAirportId,
    defaultFleetId: source.defaultFleetId, durationMinutes: source.scheduledDurationMinutes,
    cruiseAltitude: source.cruiseAltitude, route: source.route, networkPolicy: source.networkPolicy,
    effectiveFrom: source.effectiveFrom, effectiveUntil: source.effectiveUntil, internalNotes: source.internalNotes,
    dataOrigin: "HISPAFLY_NATIVE", overrideConflicts: input.overrideConflicts, overrideReason: input.overrideReason,
  }, actor);
  await prisma.aocAuditLog.create({ data: {
    staffUserId: actorId(actor), action: "LEGACY_ROUTE_COPIED", entityType: "Route", entityId: copy.id,
    message: `${actor.name} copied route ${source.routeCode ?? source.id} to Native draft ${copy.routeCode}.`,
    metadata: { sourceRouteId: source.id, sourceLegacyId: source.vamsysRouteId, copiedRouteId: copy.id },
  } });
  return copy;
}
