import { prisma } from "@/lib/prisma";
import { normalizeRegistration } from "./normalize";
import type { NativeOrigin } from "./airport";

export const findAircraftById = (id: string) => prisma.aircraft.findUnique({
  where: { id }, include: { nativeFleet: true, currentAirport: true },
});

export async function createNativeAircraft(input: {
  registration: string; aircraftType: string; fleetId: string; serialNumber?: string | null;
  currentAirportId?: string | null; status?: string | null; dataOrigin?: NativeOrigin;
}) {
  const [fleet, airport] = await Promise.all([
    prisma.fleet.findUnique({ where: { id: input.fleetId }, select: { id: true, name: true } }),
    input.currentAirportId ? prisma.airport.findUnique({ where: { id: input.currentAirportId }, select: { id: true } }) : null,
  ]);
  if (!fleet) throw new Error("Fleet does not exist.");
  if (input.currentAirportId && !airport) throw new Error("Current airport does not exist.");
  return prisma.aircraft.create({ data: {
    registration: normalizeRegistration(input.registration), aircraftType: input.aircraftType.trim().toUpperCase(),
    nativeFleetId: fleet.id, fleetName: fleet.name, serialNumber: input.serialNumber?.trim() || null,
    currentAirportId: airport?.id ?? null, status: input.status ?? "AVAILABLE",
    dataOrigin: input.dataOrigin ?? "HISPAFLY_NATIVE", syncStatus: "LOCAL_DRAFT",
  } });
}
