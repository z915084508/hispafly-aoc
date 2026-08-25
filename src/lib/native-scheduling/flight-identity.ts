import type { Prisma } from "@prisma/client";
import { classifyRouteMarket, nextRouteIdentities } from "@/lib/native-flight/route-automation";

export async function allocateScheduleIdentities(tx: Prisma.TransactionClient, routeId: string, paired = false) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('schedule-flight-identity'))`;
  const route = await tx.route.findUnique({
    where: { id: routeId },
    include: { departureAirport: { select: { country: true } }, arrivalAirport: { select: { country: true } } },
  });
  if (!route?.departureAirport || !route.arrivalAirport) throw new Error("Route airports are required before assigning a flight identity.");
  const [schedules, routes, reservations, flights] = await Promise.all([
    tx.flightSchedule.findMany({ select: { flightNumber: true, callsign: true } }),
    tx.route.findMany({ select: { flightNumber: true, callsign: true } }),
    tx.routeIdentityReservation.findMany({ select: { flightNumber: true, callsign: true } }),
    tx.flight.findMany({ distinct: ["flightNumber"], select: { flightNumber: true, callsign: true } }),
  ]);
  return nextRouteIdentities(
    classifyRouteMarket(route.departureAirport, route.arrivalAirport),
    [...schedules, ...routes, ...reservations, ...flights],
    paired,
  );
}
