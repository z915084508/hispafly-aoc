import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { NativeOrigin } from "./airport";

export const findBookingById = (id: string) => prisma.pilotBooking.findUnique({
  where: { id }, include: { pilot: true, flight: true, route: true, aircraft: true, dispatch: true },
});

export async function createNativeBooking(input: {
  pilotId: string; flightId: string; aircraftId?: string | null; dataOrigin?: NativeOrigin;
}) {
  return prisma.$transaction(async (tx) => {
    const [pilot, flight] = await Promise.all([
      tx.pilot.findUnique({ where: { id: input.pilotId }, select: { id: true } }),
      tx.flight.findUnique({ where: { id: input.flightId }, include: { route: true } }),
    ]);
    if (!pilot || !flight) throw new Error("Pilot or flight does not exist.");
    const aircraftId = input.aircraftId ?? flight.assignedAircraftId;
    if (aircraftId) {
      const conflict = await tx.pilotBooking.findFirst({ where: {
        aircraftId, status: "BOOKED",
        selectedDepartureAt: { lt: flight.scheduledArrival },
        OR: [{ estimatedArrivalAt: { gt: flight.scheduledDeparture } }, { estimatedArrivalAt: null }],
      } });
      if (conflict) throw new Error("Aircraft is already assigned during this flight window.");
    }
    return tx.pilotBooking.create({ data: {
      pilotId: pilot.id, flightId: flight.id, routeId: flight.routeId, aircraftId,
      departureIcao: flight.route.departure, arrivalIcao: flight.route.arrival,
      flightNumber: flight.flightNumber, callsign: flight.callsign,
      selectedDepartureAt: flight.scheduledDeparture, estimatedArrivalAt: flight.scheduledArrival,
      dataOrigin: input.dataOrigin ?? "HISPAFLY_NATIVE",
    } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
