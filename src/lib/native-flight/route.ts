import { prisma } from "@/lib/prisma";
import { normalizeCode } from "./normalize";
import type { NativeOrigin } from "./airport";

export const findRouteById = (id: string) => prisma.route.findUnique({
  where: { id }, include: { departureAirport: true, arrivalAirport: true, defaultFleet: true },
});

export async function createNativeRoute(input: {
  routeCode: string; departureAirportId: string; arrivalAirportId: string;
  flightNumber?: string | null; callsign?: string | null; defaultFleetId?: string | null;
  durationMinutes?: number | null; effectiveFrom?: Date | null; effectiveUntil?: Date | null;
  dataOrigin?: NativeOrigin;
}) {
  if (input.departureAirportId === input.arrivalAirportId) throw new Error("Departure and arrival airports must differ.");
  const [departure, arrival, fleet] = await Promise.all([
    prisma.airport.findUnique({ where: { id: input.departureAirportId } }),
    prisma.airport.findUnique({ where: { id: input.arrivalAirportId } }),
    input.defaultFleetId ? prisma.fleet.findUnique({ where: { id: input.defaultFleetId } }) : null,
  ]);
  if (!departure || !arrival) throw new Error("Route airports do not exist.");
  if (input.defaultFleetId && !fleet) throw new Error("Default fleet does not exist.");
  return prisma.route.create({ data: {
    routeCode: normalizeCode(input.routeCode, "Route code"),
    departure: departure.icao, arrival: arrival.icao,
    departureAirportId: departure.id, arrivalAirportId: arrival.id,
    defaultFleetId: fleet?.id ?? null, flightNumber: input.flightNumber?.trim().toUpperCase() || null,
    callsign: input.callsign?.trim().toUpperCase() || null,
    scheduledDurationMinutes: input.durationMinutes ?? null,
    effectiveFrom: input.effectiveFrom ?? null, effectiveUntil: input.effectiveUntil ?? null,
    operationalStatus: "DRAFT", syncStatus: "LOCAL_DRAFT", active: true,
    dataOrigin: input.dataOrigin ?? "HISPAFLY_NATIVE",
  } });
}
