import type { FleetOperationalStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { StaffIdentity } from "@/lib/staff/currentStaff";
import type { NativeOrigin } from "./airport";
import { nonNegative, normalizeFleetInput } from "./fleet-aircraft-rules";
const actorId = (actor: StaffIdentity) => actor.id === "development-staff" ? null : actor.id;
const editable = (origin: string) => origin !== "VAMSYS_LEGACY";

export type FleetInput = {
  code: string; name: string; type: string; iataType?: string | null; manufacturer?: string | null;
  family?: string | null; variant?: string | null; engineType?: string | null; typicalSeatCapacity?: number | null;
  maxPassengers?: number | null; maxCargoKg?: number | null; rangeNm?: number | null; cruiseSpeedKts?: number | null;
  defaultCruiseAltitudeFt?: number | null; etopsMinutes?: number | null; internalNotes?: string | null; dataOrigin?: NativeOrigin;
};
function fleetData(input: FleetInput) {
  const normalized = normalizeFleetInput(input);
  return {
    ...normalized, name: input.name.trim(), manufacturer: input.manufacturer?.trim() || null,
    family: input.family?.trim() || null, variant: input.variant?.trim() || null, engineType: input.engineType?.trim() || null,
    typicalSeatCapacity: nonNegative(input.typicalSeatCapacity, "Typical seat capacity"),
    maxPassengers: nonNegative(input.maxPassengers, "Maximum passenger capacity"),
    maxCargoKg: nonNegative(input.maxCargoKg, "Maximum cargo"),
    rangeNm: nonNegative(input.rangeNm, "Range"), cruiseSpeedKts: nonNegative(input.cruiseSpeedKts, "Cruise speed"),
    defaultCruiseAltitudeFt: nonNegative(input.defaultCruiseAltitudeFt, "Default cruise altitude"),
    etopsMinutes: nonNegative(input.etopsMinutes, "ETOPS minutes"), internalNotes: input.internalNotes?.trim() || null,
  };
}
export const findFleetById = (id: string) => prisma.fleet.findUnique({ where: { id }, include: {
  nativeAircraft: { include: { currentAirport: true } }, defaultRoutes: true,
  routeAssignments: { include: { route: true } }, routeCompatibility: { include: { route: true } },
  _count: { select: { flightOffers: true } },
} });
export async function listFleets(input: { search?: string; status?: FleetOperationalStatus; dataOrigin?: string; manufacturer?: string; family?: string; page?: number }) {
  const page = Math.max(1, input.page ?? 1), search = input.search?.trim();
  const where: Prisma.FleetWhereInput = {
    ...(search ? { OR: [{ code: { contains: search, mode: "insensitive" } }, { name: { contains: search, mode: "insensitive" } }, { type: { contains: search, mode: "insensitive" } }] } : {}),
    ...(input.status ? { operationalStatus: input.status } : {}), ...(input.dataOrigin ? { dataOrigin: input.dataOrigin as never } : {}),
    ...(input.manufacturer ? { manufacturer: { equals: input.manufacturer, mode: "insensitive" } } : {}),
    ...(input.family ? { family: { equals: input.family, mode: "insensitive" } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.fleet.findMany({ where, include: { _count: { select: { nativeAircraft: true, defaultRoutes: true, routeAssignments: true } }, nativeAircraft: { where: { operationalStatus: "AVAILABLE" }, select: { id: true } } }, orderBy: [{ code: "asc" }, { name: "asc" }], skip: (page - 1) * 25, take: 25 }),
    prisma.fleet.count({ where }),
  ]); return { rows, total, page, pageSize: 25 };
}
export async function createNativeFleet(input: FleetInput, actor?: StaffIdentity) {
  const data = fleetData(input);
  return prisma.$transaction(async tx => {
    if (await tx.fleet.findFirst({ where: { code: { equals: data.code, mode: "insensitive" } } })) throw new Error("Fleet code already exists.");
    const fleet = await tx.fleet.create({ data: { ...data, dataOrigin: input.dataOrigin ?? "HISPAFLY_NATIVE", operationalStatus: "DRAFT", active: false, syncStatus: "LOCAL_DRAFT" } });
    if (actor) await tx.aocAuditLog.create({ data: { staffUserId: actorId(actor), action: "FLEET_CREATED", entityType: "Fleet", entityId: fleet.id, message: `${actor.name} created Native fleet ${fleet.code}.`, metadata: { after: data } } });
    return fleet;
  });
}
export async function updateNativeFleet(id: string, input: FleetInput, actor: StaffIdentity) {
  const data = fleetData(input);
  return prisma.$transaction(async tx => {
    const before = await tx.fleet.findUnique({ where: { id } }); if (!before) throw new Error("Fleet not found.");
    if (!editable(before.dataOrigin) || before.operationalStatus === "ARCHIVED") throw new Error("Legacy or archived fleets are read-only.");
    if (await tx.fleet.findFirst({ where: { id: { not: id }, code: { equals: data.code, mode: "insensitive" } } })) throw new Error("Fleet code already exists.");
    const fleet = await tx.fleet.update({ where: { id }, data });
    await tx.aocAuditLog.create({ data: { staffUserId: actorId(actor), action: "FLEET_UPDATED", entityType: "Fleet", entityId: id, message: `${actor.name} updated fleet ${fleet.code}.`, metadata: { before: { code: before.code, type: before.type, status: before.operationalStatus }, after: data } } });
    return fleet;
  });
}
export async function changeFleetStatus(id: string, status: FleetOperationalStatus, actor: StaffIdentity, reason: string) {
  if (!["DRAFT", "ACTIVE", "SUSPENDED", "ARCHIVED"].includes(status)) throw new Error("Unsupported Fleet status.");
  if (!reason.trim()) throw new Error("A reason is required.");
  return prisma.$transaction(async tx => {
    const before = await tx.fleet.findUnique({ where: { id }, include: { _count: { select: { nativeAircraft: true, defaultRoutes: true, routeAssignments: true } } } });
    if (!before) throw new Error("Fleet not found."); if (!editable(before.dataOrigin)) throw new Error("Legacy fleets are read-only.");
    const row = await tx.fleet.update({ where: { id }, data: { operationalStatus: status, active: status === "ACTIVE", archivedAt: status === "ARCHIVED" ? new Date() : null } });
    await tx.aocAuditLog.create({ data: { staffUserId: actorId(actor), action: status === "ARCHIVED" ? "FLEET_ARCHIVED" : "FLEET_STATUS_CHANGED", entityType: "Fleet", entityId: id, message: `${actor.name} changed ${row.code} from ${before.operationalStatus} to ${status}.`, metadata: { reason, impact: before._count } } });
    return row;
  });
}
export async function copyFleetToNativeDraft(id: string, code: string, actor: StaffIdentity) {
  const source = await prisma.fleet.findUnique({ where: { id } }); if (!source) throw new Error("Fleet not found.");
  const copy = await createNativeFleet({ code, name: source.name ?? code, type: source.type ?? code, iataType: source.iataType, manufacturer: source.manufacturer, family: source.family, variant: source.variant, engineType: source.engineType, typicalSeatCapacity: source.typicalSeatCapacity, maxPassengers: source.maxPassengers, maxCargoKg: source.maxCargoKg, rangeNm: source.rangeNm, cruiseSpeedKts: source.cruiseSpeedKts, defaultCruiseAltitudeFt: source.defaultCruiseAltitudeFt, etopsMinutes: source.etopsMinutes, internalNotes: source.internalNotes }, actor);
  await prisma.aocAuditLog.create({ data: { staffUserId: actorId(actor), action: "LEGACY_FLEET_COPIED", entityType: "Fleet", entityId: copy.id, message: `${actor.name} copied Legacy fleet to Native draft ${copy.code}.`, metadata: { sourceFleetId: id, sourceLegacyId: source.vamsysFleetId } } });
  return copy;
}
