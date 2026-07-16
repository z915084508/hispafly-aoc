import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const relationCount = async (
  model: { count(args?: unknown): Promise<number> },
  nativeWhere: Record<string, unknown>,
  historicalOnly = false,
) => {
  const [total, nativeReady, legacyTotal, legacyLinked, invalid] = await Promise.all([
    model.count(),
    model.count({ where: { dataOrigin: "HISPAFLY_NATIVE", ...nativeWhere } }),
    model.count({ where: { dataOrigin: { not: "HISPAFLY_NATIVE" } } }),
    model.count({ where: { dataOrigin: { not: "HISPAFLY_NATIVE" }, ...nativeWhere } }),
    model.count({ where: { dataOrigin: "HISPAFLY_NATIVE", NOT: nativeWhere } }),
  ]);
  const unresolved = legacyTotal - legacyLinked;
  return { total, nativeReady, legacyLinked: historicalOnly ? 0 : legacyLinked, legacyUnresolved: historicalOnly ? 0 : unresolved, historicalOnly: historicalOnly ? legacyTotal : 0, invalid, missingRelations: invalid + (historicalOnly ? 0 : unresolved) };
};
try {
  const rows = await Promise.all([
    relationCount(prisma.airport, { icao: { not: "" } }).then((counts) => ({ entity: "Airport", ...counts })),
    relationCount(prisma.route, { departureAirportId: { not: null }, arrivalAirportId: { not: null } }).then((counts) => ({ entity: "Route", ...counts })),
    relationCount(prisma.fleet, { code: { not: "" } }).then((counts) => ({ entity: "Fleet", ...counts })),
    relationCount(prisma.aircraft, { registration: { not: null }, nativeFleetId: { not: null } }).then((counts) => ({ entity: "Aircraft", ...counts })),
    relationCount(prisma.flightSchedule, { routeId: { not: "" } }).then((counts) => ({ entity: "Schedule", ...counts })),
    relationCount(prisma.flight, { routeId: { not: "" }, departureAirportId: { not: null }, arrivalAirportId: { not: null } }).then((counts) => ({ entity: "Flight", ...counts })),
    relationCount(prisma.flightOffer, { flightId: { not: null }, routeId: { not: null } }).then((counts) => ({ entity: "FlightOffer", ...counts })),
    relationCount(prisma.pilotBooking, { flightId: { not: null }, routeId: { not: null } }).then((counts) => ({ entity: "Booking", ...counts })),
    relationCount(prisma.flightDispatch, { bookingId: { not: null }, flightId: { not: null }, aircraftId: { not: null } }).then((counts) => ({ entity: "Dispatch", ...counts })),
    relationCount(prisma.pirep, { pilotId: { not: "" } }, true).then((counts) => ({ entity: "PIREP", ...counts })),
  ]);
  const [locationTotal, locationLinked] = await Promise.all([
    prisma.aircraftLocationSnapshot.count(),
    prisma.aircraftLocationSnapshot.count({ where: { aircraftId: { not: null } } }),
  ]);
  rows.splice(9, 0, { entity: "AircraftLocation", total: locationTotal, nativeReady: 0, legacyLinked: locationLinked, legacyUnresolved: locationTotal - locationLinked, historicalOnly: 0, invalid: 0, missingRelations: locationTotal - locationLinked });
  console.log(JSON.stringify(rows, null, 2));
} finally {
  await prisma.$disconnect();
}
