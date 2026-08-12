import type { FlightScheduleStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const include = { route: { include: { departureAirport: true, arrivalAirport: true, fleetAssignments: { include: { fleet: true } }, fleetCompatibility: true } }, defaultFleet: true, assignedAircraft: { include: { currentAirport: true, conditionSnapshot: true } }, _count: { select: { flights: true } } } as const;

export async function listFlightSchedules(input: { search?: string; status?: string; fleetId?: string; aircraftId?: string; effectiveDate?: string; page?: number }) {
  const page = Math.max(1, input.page ?? 1), pageSize = 25, search = input.search?.trim();
  const effectiveDate = input.effectiveDate ? new Date(`${input.effectiveDate}T00:00:00.000Z`) : null;
  const conditions: Prisma.FlightScheduleWhereInput[] = [];
  if (search) conditions.push({ OR: [{ code: { contains: search, mode: "insensitive" } }, { route: { flightNumber: { contains: search, mode: "insensitive" } } }, { route: { routeCode: { contains: search, mode: "insensitive" } } }, { route: { departure: { contains: search.toUpperCase() } } }, { route: { arrival: { contains: search.toUpperCase() } } }] });
  if (effectiveDate && Number.isFinite(effectiveDate.getTime())) conditions.push({ effectiveFrom: { lte: effectiveDate }, OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: effectiveDate } }] });
  const where: Prisma.FlightScheduleWhereInput = {
    ...(input.status ? { status: input.status as FlightScheduleStatus } : {}), ...(input.fleetId ? { defaultFleetId: input.fleetId } : {}), ...(input.aircraftId ? { assignedAircraftId: input.aircraftId } : {}),
    ...(conditions.length ? { AND: conditions } : {}),
  };
  const [rows, total] = await Promise.all([prisma.flightSchedule.findMany({ where, include, orderBy: [{ status: "asc" }, { code: "asc" }], skip: (page - 1) * pageSize, take: pageSize }), prisma.flightSchedule.count({ where })]);
  return { rows, total, page, pageSize };
}

export const getFlightSchedule = (id: string) => prisma.flightSchedule.findUnique({ where: { id }, include: { ...include, flights: { include: { fleet: true, assignedAircraft: true }, orderBy: { scheduledDeparture: "asc" }, take: 50 }, } });
export const listScheduleFormOptions = () => Promise.all([
  prisma.route.findMany({ include: { departureAirport: true, arrivalAirport: true, defaultFleet: true, fleetAssignments: { include: { fleet: true } }, fleetCompatibility: true }, orderBy: [{ flightNumber: "asc" }, { routeCode: "asc" }] }),
  prisma.fleet.findMany({ where: { archivedAt: null }, orderBy: { code: "asc" } }),
  prisma.aircraft.findMany({ where: { archivedAt: null, operationMode: { in: ["SCHEDULED", "FLEX"] }, operationalStatus: { notIn: ["MAINTENANCE", "FERRY_ONLY", "AOG", "SUSPENDED", "RETIRED"] } }, include: { currentAirport: true, conditionSnapshot: true, hubs: { include: { airport: true } } }, orderBy: { registration: "asc" } }),
]);

export async function listAirportScheduleCoverage(airportId?: string) {
  const airports = await prisma.airport.findMany({ where: { status: "ACTIVE", archivedAt: null }, include: {
    departureRoutes: { include: { schedules: { where: { status: { in: ["DRAFT", "ACTIVE", "SUSPENDED"] } }, include: { assignedAircraft: true }, orderBy: { departureTimeMinutesUtc: "asc" } } } },
    arrivalRoutes: { include: { schedules: { where: { status: { in: ["DRAFT", "ACTIVE", "SUSPENDED"] } }, include: { assignedAircraft: true }, orderBy: { departureTimeMinutesUtc: "asc" } } } },
  }, orderBy: { icao: "asc" } });
  const rows = airports.map((airport) => { const schedules=[...airport.departureRoutes,...airport.arrivalRoutes].flatMap((route)=>route.schedules.map((schedule)=>({...schedule,route})));const unique=[...new Map(schedules.map((schedule)=>[schedule.id,schedule])).values()];return{airport,schedules:unique,hasProgramacion:unique.length>0}; });
  return { rows, selected: rows.find((row)=>row.airport.id===airportId)??rows.find((row)=>row.hasProgramacion)??rows[0]??null };
}
