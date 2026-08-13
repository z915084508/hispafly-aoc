import type { PilotBookingStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { rosterState } from "./rules";

export const ROSTER_ACTIVE_STATUSES = ["PENDING", "CONFIRMED", "BOOKED", "DISPATCH_PENDING", "DISPATCHED", "IN_PROGRESS"] as const;

export async function getPilotRoster(pilotId: string, input: { from?: Date; to?: Date; includeHistory?: boolean } = {}) {
  const now = new Date();
  const statuses: PilotBookingStatus[] = input.includeHistory
    ? [...ROSTER_ACTIVE_STATUSES, "COMPLETED", "FLOWN", "CANCELLED"]
    : [...ROSTER_ACTIVE_STATUSES];
  const rows = await prisma.pilotBooking.findMany({
    where: {
      pilotId,
      flightId: { not: null },
      dataOrigin: "HISPAFLY_NATIVE",
      status: { in: statuses },
      selectedDepartureAt: {
        gte: input.from ?? (input.includeHistory ? undefined : now),
        ...(input.to ? { lt: input.to } : {}),
      },
    },
    include: { flight: { include: { assignedAircraft: true } }, aircraft: true },
    orderBy: { selectedDepartureAt: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    flightInstanceId: row.flightId!,
    flightNumber: row.flightNumber ?? row.flight?.flightNumber ?? "—",
    callsign: row.callsign ?? row.flight?.callsign ?? null,
    departure: row.departureIcao,
    arrival: row.arrivalIcao,
    departureTime: row.selectedDepartureAt,
    arrivalTime: row.estimatedArrivalAt,
    aircraftRegistration: row.aircraftRegistration ?? row.aircraft?.registration ?? row.flight?.assignedAircraft?.registration ?? null,
    status: rosterState(row.status, row.flight?.status),
  }));
}
