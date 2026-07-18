import { prisma } from "@/lib/prisma";
import { resolveAircraftState } from "./aircraft-state";
export type AircraftAvailabilityResult = { allowed: boolean; blockingReasons: string[]; warnings: string[]; checkedAt: Date };
export async function checkAircraftAvailability(input: { aircraftId: string; routeId?: string | null; departureAirportId?: string | null; startsAt: Date; endsAt: Date; ferryFlight?: boolean }): Promise<AircraftAvailabilityResult> {
  const blockingReasons: string[] = [], warnings: string[] = [], checkedAt = new Date();
  if (input.endsAt <= input.startsAt) return { allowed: false, blockingReasons: ["The assignment end must be after its start."], warnings, checkedAt };
  const aircraft = await prisma.aircraft.findUnique({ where: { id: input.aircraftId }, include: { nativeFleet: true, currentAirport: true, conditionSnapshot: true, locationSnapshot: true } });
  if (!aircraft) return { allowed: false, blockingReasons: ["Aircraft does not exist."], warnings, checkedAt };
  const aircraftState = resolveAircraftState(aircraft);
  if (!aircraftState.available && !(input.ferryFlight && aircraft.operationalStatus === "FERRY_ONLY")) blockingReasons.push(`Aircraft state is not assignable.`);
  if (!aircraft.nativeFleet || aircraft.nativeFleet.operationalStatus !== "ACTIVE") blockingReasons.push("Aircraft Fleet is not active.");
  if (aircraft.conditionSnapshot && (["AOG", "IN_MAINTENANCE"].includes(aircraft.conditionSnapshot.operationalStatus) || ["REQUIRED", "IN_PROGRESS", "WAITING_MAINTENANCE"].includes(aircraft.conditionSnapshot.maintenanceStatus))) blockingReasons.push("Maintenance status blocks normal assignment.");
  if (aircraft.operationalStatus === "FERRY_ONLY" && !input.ferryFlight) blockingReasons.push("Aircraft is restricted to maintenance ferry operations.");
  if (input.departureAirportId && aircraftState.currentAirportId !== input.departureAirportId) blockingReasons.push("Aircraft is not at the required departure airport.");
  if (!aircraftState.currentAirportId) warnings.push("Aircraft current airport is unknown.");
  if (aircraftState.stale) warnings.push("Aircraft location is older than 72 hours.");
  if (aircraftState.external) warnings.push("Aircraft location came from an external vAMSYS movement.");
  const [flightConflict, bookingConflict, dispatchConflict, compatibility] = await Promise.all([
    prisma.flight.findFirst({ where: { assignedAircraftId: input.aircraftId, status: { notIn: ["COMPLETED", "CANCELLED"] }, scheduledDeparture: { lt: input.endsAt }, scheduledArrival: { gt: input.startsAt } }, select: { id: true } }),
    prisma.pilotBooking.findFirst({ where: { aircraftId: input.aircraftId, status: "BOOKED", selectedDepartureAt: { lt: input.endsAt }, OR: [{ estimatedArrivalAt: { gt: input.startsAt } }, { estimatedArrivalAt: null }] }, select: { id: true } }),
    prisma.flightDispatch.findFirst({ where: { aircraftId: input.aircraftId, status: { in: ["DISPATCHING", "DISPATCHED"] }, selectedDepartureAt: { lt: input.endsAt }, OR: [{ estimatedArrivalAt: { gt: input.startsAt } }, { estimatedArrivalAt: null }] }, select: { id: true } }),
    input.routeId && aircraft.nativeFleetId ? prisma.routeFleetCompatibility.findUnique({ where: { routeId_fleetId: { routeId: input.routeId, fleetId: aircraft.nativeFleetId } } }) : null,
  ]);
  if (flightConflict) blockingReasons.push("Aircraft has an overlapping Flight assignment.");
  if (bookingConflict) blockingReasons.push("Aircraft has an overlapping Booking.");
  if (dispatchConflict) blockingReasons.push("Aircraft has an active overlapping Dispatch.");
  if (compatibility?.policy === "FORBIDDEN") blockingReasons.push("Aircraft Fleet is forbidden on this Route.");
  if (input.routeId && !compatibility) warnings.push("No explicit Route/Fleet compatibility rule exists.");
  return { allowed: blockingReasons.length === 0, blockingReasons, warnings, checkedAt };
}
