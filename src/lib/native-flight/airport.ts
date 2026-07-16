import type { AirportStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { StaffIdentity } from "@/lib/staff/currentStaff";
import { validateAirportInput } from "./management-rules";
import { normalizeIcao } from "./normalize";

export type NativeOrigin = "HISPAFLY_NATIVE" | "IMPORTED" | "MANUAL";
const actorId = (actor: StaffIdentity) => actor.id === "development-staff" ? null : actor.id;
const editableOrigins = new Set(["HISPAFLY_NATIVE", "IMPORTED", "MANUAL"]);

export const findAirportById = (id: string) => prisma.airport.findUnique({
  where: { id },
  include: {
    departureRoutes: { select: { id: true, routeCode: true, flightNumber: true, operationalStatus: true } },
    arrivalRoutes: { select: { id: true, routeCode: true, flightNumber: true, operationalStatus: true } },
    _count: { select: { currentAircraft: true, locationSnapshots: true } },
  },
});
export const findAirportByIcao = (icao: string) => prisma.airport.findUnique({ where: { icao: normalizeIcao(icao) } });

export async function listAirports(input: {
  search?: string; country?: string; status?: AirportStatus; dataOrigin?: string; page?: number; pageSize?: number;
}) {
  const page = Math.max(1, input.page ?? 1), pageSize = Math.min(100, Math.max(1, input.pageSize ?? 25));
  const search = input.search?.trim();
  const where: Prisma.AirportWhereInput = {
    ...(search ? { OR: [
      { icao: { contains: search.toUpperCase() } }, { iata: { contains: search.toUpperCase() } },
      { name: { contains: search, mode: "insensitive" } }, { city: { contains: search, mode: "insensitive" } },
    ] } : {}),
    ...(input.country ? { country: { equals: input.country, mode: "insensitive" } } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.dataOrigin ? { dataOrigin: input.dataOrigin as never } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.airport.findMany({
      where, include: { _count: { select: { departureRoutes: true, arrivalRoutes: true } } },
      orderBy: [{ icao: "asc" }], skip: (page - 1) * pageSize, take: pageSize,
    }),
    prisma.airport.count({ where }),
  ]);
  return { rows, total, page, pageSize };
}

type AirportInput = {
  icao: string; iata?: string | null; name?: string | null; city?: string | null;
  country?: string | null; region?: string | null; timezone?: string | null;
  latitude?: number | null; longitude?: number | null; dataOrigin?: NativeOrigin;
};

function airportData(input: AirportInput) {
  const validated = validateAirportInput(input);
  return {
    ...validated, name: input.name?.trim() || null, city: input.city?.trim() || null,
    country: input.country?.trim() || null, region: input.region?.trim() || null,
  };
}

export async function createNativeAirport(input: AirportInput, actor?: StaffIdentity) {
  const data = airportData(input);
  return prisma.$transaction(async (tx) => {
    if (await tx.airport.findUnique({ where: { icao: data.icao } })) throw new Error("An airport with this ICAO already exists.");
    const airport = await tx.airport.create({ data: {
      ...data, dataOrigin: input.dataOrigin ?? "HISPAFLY_NATIVE", source: "hispafly_native",
    } });
    if (actor) await tx.aocAuditLog.create({ data: {
      staffUserId: actorId(actor), action: "AIRPORT_CREATED", entityType: "Airport", entityId: airport.id,
      message: `${actor.name} created airport ${airport.icao}.`, metadata: { after: data },
    } });
    return airport;
  });
}

export async function updateAirport(id: string, input: AirportInput, actor: StaffIdentity) {
  const data = airportData(input);
  return prisma.$transaction(async (tx) => {
    const before = await tx.airport.findUnique({ where: { id } });
    if (!before) throw new Error("Airport not found.");
    if (!editableOrigins.has(before.dataOrigin)) throw new Error("Legacy airports are read-only.");
    const duplicate = await tx.airport.findFirst({ where: { icao: data.icao, id: { not: id } } });
    if (duplicate) throw new Error("An airport with this ICAO already exists.");
    const airport = await tx.airport.update({ where: { id }, data });
    await tx.aocAuditLog.create({ data: {
      staffUserId: actorId(actor), action: "AIRPORT_UPDATED", entityType: "Airport", entityId: id,
      message: `${actor.name} updated airport ${airport.icao}.`,
      metadata: { before: { icao: before.icao, iata: before.iata, name: before.name, status: before.status }, after: data },
    } });
    return airport;
  });
}

export async function changeAirportStatus(id: string, status: AirportStatus, actor: StaffIdentity, reason: string) {
  if (!["ACTIVE", "INACTIVE", "ARCHIVED"].includes(status)) throw new Error("Unsupported airport status.");
  if (!reason.trim()) throw new Error("A reason is required for airport status changes.");
  return prisma.$transaction(async (tx) => {
    const before = await tx.airport.findUnique({ where: { id }, include: { _count: { select: { departureRoutes: true, arrivalRoutes: true, currentAircraft: true } } } });
    if (!before) throw new Error("Airport not found.");
    if (!editableOrigins.has(before.dataOrigin)) throw new Error("Legacy airports are read-only.");
    const airport = await tx.airport.update({ where: { id }, data: { status, archivedAt: status === "ARCHIVED" ? new Date() : null } });
    await tx.aocAuditLog.create({ data: {
      staffUserId: actorId(actor), action: status === "ARCHIVED" ? "AIRPORT_ARCHIVED" : "AIRPORT_STATUS_CHANGED",
      entityType: "Airport", entityId: id, message: `${actor.name} changed ${airport.icao} from ${before.status} to ${status}.`,
      metadata: { before: before.status, after: status, reason, impact: before._count },
    } });
    return airport;
  });
}
