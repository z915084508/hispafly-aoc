import { prisma } from "@/lib/prisma";
import { ACTIVE_SCHEDULED_BOOKING_STATUSES, airportLocalDay, deriveDepartureAvailability } from "./departures";
import type { PilotBookingStatus } from "@prisma/client";

export async function loadPilotDepartures(pilotId: string, selectedDate?: string) {
  const pilot = await prisma.pilot.findUnique({ where: { id: pilotId }, include: { currentAirport: true } });
  if (!pilot) throw new Error("Pilot does not exist.");
  const zone = pilot.currentAirport?.timezone || "UTC";
  const day = airportLocalDay(selectedDate, zone);
  if (!pilot.currentAirportId) return { pilot, day, flights: [], upcoming: [] };
  const activeStatuses = [...ACTIVE_SCHEDULED_BOOKING_STATUSES] as PilotBookingStatus[];
  const include = { route: true, fleet: true, assignedAircraft: true, arrivalAirport: true, schedule: true, bookings: { where: { status: { in: activeStatuses } }, select: { id: true, pilotId: true } } } as const;
  const base = { departureAirportId: pilot.currentAirportId, operatingType: "SCHEDULED", scheduleId: { not: null } } as const;
  const [flights, upcoming] = await Promise.all([
    prisma.flight.findMany({ where: { ...base, scheduledDeparture: { gte: day.startUtc, lt: day.endUtc } }, include, orderBy: { scheduledDeparture: "asc" }, take: 200 }),
    prisma.flight.findMany({ where: { ...base, scheduledDeparture: { gte: day.endUtc } }, include, orderBy: { scheduledDeparture: "asc" }, take: 7 }),
  ]);
  const decorate = <T extends { status: string; bookingOpenAt: Date | null; bookingCloseAt: Date | null; scheduledDeparture: Date; departureAirportId: string | null; bookings: { id: string; pilotId: string }[] }>(flight: T) => ({ ...flight, availability: deriveDepartureAvailability({ ...flight, pilotId, currentAirportId: pilot.currentAirportId, activeBookings: flight.bookings }) });
  return { pilot, day, flights: flights.map(decorate), upcoming: upcoming.map(decorate) };
}
