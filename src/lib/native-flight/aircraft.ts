import type { NativeAircraftStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { StaffIdentity } from "@/lib/staff/currentStaff";
import type { NativeOrigin } from "./airport";
import { nonNegative, normalizeAircraftInput } from "./fleet-aircraft-rules";
const actorId = (actor: StaffIdentity) => actor.id === "development-staff" ? null : actor.id;
const editable = (origin: string) => origin !== "VAMSYS_LEGACY";
export type AircraftInput = {
  registration: string; aircraftType: string; fleetId: string; name?: string | null; serialNumber?: string | null;
  selcal?: string | null; deliveryDate?: Date | null; inServiceDate?: Date | null; cabinConfiguration?: string | null;
  seatCapacity?: number | null; cargoCapacityKg?: number | null; internalNotes?: string | null; dataOrigin?: NativeOrigin;
};
function aircraftData(input: AircraftInput) {
  const normalized = normalizeAircraftInput(input);
  return { ...normalized, name: input.name?.trim() || null, serialNumber: input.serialNumber?.trim() || null,
    deliveryDate: input.deliveryDate ?? null, inServiceDate: input.inServiceDate ?? null, cabinConfiguration: input.cabinConfiguration?.trim() || null,
    seatCapacity: nonNegative(input.seatCapacity, "Seat capacity"), cargoCapacityKg: nonNegative(input.cargoCapacityKg, "Cargo capacity"),
    internalNotes: input.internalNotes?.trim() || null };
}
async function activeFleet(tx: Prisma.TransactionClient, id: string) {
  const fleet = await tx.fleet.findUnique({ where: { id } });
  if (!fleet || fleet.operationalStatus !== "ACTIVE" || fleet.dataOrigin === "VAMSYS_LEGACY") throw new Error("Aircraft must use an active Native Fleet.");
  return fleet;
}
export const findAircraftById = (id: string) => prisma.aircraft.findUnique({ where: { id }, include: {
  nativeFleet: true, currentAirport: true, locationSnapshot: true, conditionSnapshot: true,
  maintenanceOrders: { orderBy: { createdAt: "desc" }, take: 10 },
  assignedFlights: { where: { status: { notIn: ["COMPLETED", "CANCELLED"] } }, orderBy: { scheduledDeparture: "asc" }, take: 10 },
  nativeBookings: { where: { status: "BOOKED" }, orderBy: { selectedDepartureAt: "asc" }, take: 10 },
  nativeDispatches: { where: { status: { in: ["DISPATCHING", "DISPATCHED"] } }, orderBy: { createdAt: "desc" }, take: 10 },
} });
export async function listAircraft(input: { search?: string; fleetId?: string; airportId?: string; status?: NativeAircraftStatus; maintenanceStatus?: string; dataOrigin?: string; page?: number }) {
  const page = Math.max(1, input.page ?? 1), search = input.search?.trim();
  const where: Prisma.AircraftWhereInput = {
    ...(search ? { registration: { contains: search, mode: "insensitive" } } : {}), ...(input.fleetId ? { nativeFleetId: input.fleetId } : {}),
    ...(input.airportId ? { currentAirportId: input.airportId } : {}), ...(input.status ? { operationalStatus: input.status } : {}),
    ...(input.dataOrigin ? { dataOrigin: input.dataOrigin as never } : {}),
    ...(input.maintenanceStatus ? { conditionSnapshot: { maintenanceStatus: input.maintenanceStatus as never } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.aircraft.findMany({ where, include: { nativeFleet: true, currentAirport: true, locationSnapshot: true, conditionSnapshot: true }, orderBy: { registration: "asc" }, skip: (page - 1) * 25, take: 25 }),
    prisma.aircraft.count({ where }),
  ]); return { rows, total, page, pageSize: 25 };
}
export async function createNativeAircraft(input: AircraftInput, actor?: StaffIdentity) {
  const data = aircraftData(input);
  return prisma.$transaction(async tx => {
    const fleet = await activeFleet(tx, input.fleetId);
    if (await tx.aircraft.findFirst({ where: { registration: { equals: data.registration, mode: "insensitive" } } })) throw new Error("Aircraft registration already exists.");
    const aircraft = await tx.aircraft.create({ data: { ...data, nativeFleetId: fleet.id, fleetName: fleet.name, operationalStatus: "UNKNOWN", status: "UNKNOWN", dataOrigin: input.dataOrigin ?? "HISPAFLY_NATIVE", syncStatus: "LOCAL_DRAFT" } });
    await tx.aircraftLocationSnapshot.create({ data: { aircraftId: aircraft.id, vamsysAircraftId: `native:${aircraft.id}`, registration: aircraft.registration, aircraftType: aircraft.aircraftType, status: "UNKNOWN", source: "MANUAL" } });
    if (actor) await tx.aocAuditLog.create({ data: { staffUserId: actorId(actor), action: "AIRCRAFT_CREATED", entityType: "Aircraft", entityId: aircraft.id, message: `${actor.name} created Native aircraft ${aircraft.registration}.`, metadata: { fleetId: fleet.id } } });
    return aircraft;
  });
}
export async function updateNativeAircraft(id: string, input: AircraftInput, actor: StaffIdentity) {
  const data = aircraftData(input);
  return prisma.$transaction(async tx => {
    const before = await tx.aircraft.findUnique({ where: { id } }); if (!before) throw new Error("Aircraft not found.");
    if (!editable(before.dataOrigin) || before.operationalStatus === "RETIRED") throw new Error("Legacy or retired aircraft are read-only.");
    const fleet = await activeFleet(tx, input.fleetId);
    if (await tx.aircraft.findFirst({ where: { id: { not: id }, registration: { equals: data.registration, mode: "insensitive" } } })) throw new Error("Aircraft registration already exists.");
    const aircraft = await tx.aircraft.update({ where: { id }, data: { ...data, nativeFleetId: fleet.id, fleetName: fleet.name } });
    await tx.aircraftLocationSnapshot.updateMany({ where: { aircraftId: id }, data: { registration: aircraft.registration, aircraftType: aircraft.aircraftType } });
    await tx.aocAuditLog.create({ data: { staffUserId: actorId(actor), action: before.nativeFleetId === fleet.id ? "AIRCRAFT_UPDATED" : "AIRCRAFT_FLEET_REASSIGNED", entityType: "Aircraft", entityId: id, message: `${actor.name} updated ${aircraft.registration}.`, metadata: { before: { registration: before.registration, fleetId: before.nativeFleetId }, after: { registration: aircraft.registration, fleetId: fleet.id } } } });
    return aircraft;
  });
}
export async function changeAircraftStatus(id: string, status: NativeAircraftStatus, actor: StaffIdentity, reason: string) {
  if (!reason.trim()) throw new Error("A reason is required.");
  return prisma.$transaction(async tx => {
    const before = await tx.aircraft.findUnique({ where: { id } }); if (!before) throw new Error("Aircraft not found.");
    if (!editable(before.dataOrigin)) throw new Error("Legacy aircraft are read-only.");
    const aircraft = await tx.aircraft.update({ where: { id }, data: { operationalStatus: status, status, archivedAt: status === "RETIRED" ? new Date() : null } });
    const locationStatus = status === "AVAILABLE" ? "AVAILABLE" : status === "RESERVED" ? "RESERVED" : status === "IN_FLIGHT" ? "IN_FLIGHT" : ["MAINTENANCE", "AOG"].includes(status) ? "MAINTENANCE" : "UNKNOWN";
    await tx.aircraftLocationSnapshot.updateMany({ where: { aircraftId: id }, data: { status: locationStatus } });
    await tx.aocAuditLog.create({ data: { staffUserId: actorId(actor), action: status === "RETIRED" ? "AIRCRAFT_ARCHIVED" : "AIRCRAFT_STATUS_CHANGED", entityType: "Aircraft", entityId: id, message: `${actor.name} changed ${aircraft.registration} from ${before.operationalStatus} to ${status}.`, metadata: { reason } } });
    return aircraft;
  });
}
export async function setNativeAircraftLocation(id: string, airportId: string | null, coordinates: { latitude?: number | null; longitude?: number | null }, status: NativeAircraftStatus, notes: string, reason: string, actor: StaffIdentity) {
  if (!reason.trim()) throw new Error("A reason is required for manual location correction.");
  return prisma.$transaction(async tx => {
    const aircraft = await tx.aircraft.findUnique({ where: { id }, include: { currentAirport: true, locationSnapshot: true } }); if (!aircraft) throw new Error("Aircraft not found.");
    if (!editable(aircraft.dataOrigin)) throw new Error("Legacy aircraft are read-only.");
    const airport = airportId ? await tx.airport.findUnique({ where: { id: airportId } }) : null;
    if (airportId && (!airport || airport.status !== "ACTIVE")) throw new Error("Current airport must be an active internal Airport.");
    if (airport && coordinates.latitude != null && coordinates.longitude != null && (Math.abs((airport.latitude ?? coordinates.latitude) - coordinates.latitude) > 1 || Math.abs((airport.longitude ?? coordinates.longitude) - coordinates.longitude) > 1)) throw new Error("Coordinates conflict with the selected airport. Clear coordinates or select the correct airport.");
    const snapshot = await tx.aircraftLocationSnapshot.upsert({ where: { aircraftId: id }, create: { aircraftId: id, vamsysAircraftId: aircraft.vamsysAircraftId ?? `native:${id}`, registration: aircraft.registration, aircraftType: aircraft.aircraftType, currentAirportId: airport?.id, currentAirportIcao: airport?.icao, currentAirportIata: airport?.iata, lastLatitude: coordinates.latitude ?? airport?.latitude, lastLongitude: coordinates.longitude ?? airport?.longitude, status: status === "AVAILABLE" ? "AVAILABLE" : "UNKNOWN", source: "MANUAL", notes, lastReportAt: new Date() }, update: { currentAirportId: airport?.id ?? null, currentAirportIcao: airport?.icao ?? null, currentAirportIata: airport?.iata ?? null, lastLatitude: coordinates.latitude ?? airport?.latitude ?? null, lastLongitude: coordinates.longitude ?? airport?.longitude ?? null, source: "MANUAL", notes, lastReportAt: new Date(), reservedByDispatchId: null } });
    await tx.aircraft.update({ where: { id }, data: { currentAirportId: airport?.id ?? null, operationalStatus: status, status } });
    await tx.aocAuditLog.create({ data: { staffUserId: actorId(actor), action: "AIRCRAFT_LOCATION_MANUAL_SET", entityType: "Aircraft", entityId: id, message: `${actor.name} manually corrected ${aircraft.registration} location.`, metadata: { before: { airportId: aircraft.currentAirportId, latitude: aircraft.locationSnapshot?.lastLatitude, longitude: aircraft.locationSnapshot?.lastLongitude }, after: { airportId: airport?.id ?? null, ...coordinates }, reason } } });
    return snapshot;
  });
}
export async function correctAircraftTotals(id: string, totalFlightMinutes: number, totalCycles: number, reason: string, actor: StaffIdentity) {
  nonNegative(totalFlightMinutes, "Total flight minutes"); nonNegative(totalCycles, "Total cycles"); if (!reason.trim()) throw new Error("A reason is required.");
  return prisma.$transaction(async tx => {
    const before = await tx.aircraft.findUnique({ where: { id } }); if (!before) throw new Error("Aircraft not found.");
    const row = await tx.aircraft.update({ where: { id }, data: { totalFlightMinutes, totalCycles } });
    await tx.aocAuditLog.create({ data: { staffUserId: actorId(actor), action: "AIRCRAFT_TOTALS_CORRECTED", entityType: "Aircraft", entityId: id, message: `${actor.name} corrected hours/cycles for ${row.registration}.`, metadata: { before: { totalFlightMinutes: before.totalFlightMinutes, totalCycles: before.totalCycles }, after: { totalFlightMinutes, totalCycles }, reason } } });
    return row;
  });
}
export async function copyAircraftToNative(id: string, registration: string, fleetId: string, actor: StaffIdentity) {
  const source = await prisma.aircraft.findUnique({ where: { id } }); if (!source) throw new Error("Aircraft not found.");
  const copy = await createNativeAircraft({ registration, fleetId, aircraftType: source.aircraftType ?? "ZZZZ", name: source.name, serialNumber: source.serialNumber, selcal: source.selcal, deliveryDate: source.deliveryDate, inServiceDate: source.inServiceDate, cabinConfiguration: source.cabinConfiguration, seatCapacity: source.seatCapacity, cargoCapacityKg: source.cargoCapacityKg, internalNotes: source.internalNotes }, actor);
  await prisma.aocAuditLog.create({ data: { staffUserId: actorId(actor), action: "LEGACY_AIRCRAFT_COPIED", entityType: "Aircraft", entityId: copy.id, message: `${actor.name} copied Legacy aircraft to Native ${copy.registration}.`, metadata: { sourceAircraftId: id, sourceLegacyId: source.vamsysAircraftId } } });
  return copy;
}
