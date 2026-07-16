import { prisma } from "@/lib/prisma";
import type { NativeOrigin } from "./airport";

export const findFlightById = (id: string) => prisma.flight.findUnique({
  where: { id }, include: { route: true, schedule: true, assignedAircraft: true },
});

export async function createNativeFlight(input: {
  routeId: string; scheduleId?: string | null; operatingDate: Date;
  scheduledDeparture: Date; scheduledArrival: Date; flightNumber: string; callsign: string;
  assignedAircraftId?: string | null; dataOrigin?: NativeOrigin;
}) {
  if (input.scheduledArrival <= input.scheduledDeparture) throw new Error("STA must be later than STD.");
  const [route, schedule, aircraft] = await Promise.all([
    prisma.route.findUnique({ where: { id: input.routeId }, select: { id: true } }),
    input.scheduleId ? prisma.flightSchedule.findUnique({ where: { id: input.scheduleId }, select: { id: true, routeId: true } }) : null,
    input.assignedAircraftId ? prisma.aircraft.findUnique({ where: { id: input.assignedAircraftId }, select: { id: true } }) : null,
  ]);
  if (!route) throw new Error("Route does not exist.");
  if (input.scheduleId && (!schedule || schedule.routeId !== route.id)) throw new Error("Schedule does not belong to the route.");
  if (input.assignedAircraftId && !aircraft) throw new Error("Assigned aircraft does not exist.");
  return prisma.flight.create({ data: {
    routeId: route.id, scheduleId: schedule?.id ?? null,
    operatingDate: input.operatingDate, scheduledDeparture: input.scheduledDeparture,
    scheduledArrival: input.scheduledArrival, flightNumber: input.flightNumber.trim().toUpperCase(),
    callsign: input.callsign.trim().toUpperCase(), assignedAircraftId: aircraft?.id ?? null,
    dataOrigin: input.dataOrigin ?? "HISPAFLY_NATIVE",
  } });
}
