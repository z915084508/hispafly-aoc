import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { validDate } from "./time";
import type { ProposedFlightSchedule } from "./types";
import { validateProposedScheduleWithContext } from "./validation";

type DbClient = Prisma.TransactionClient | typeof prisma;
export async function validateProposedSchedule(proposed: ProposedFlightSchedule, options: { excludeScheduleId?: string; includeExistingGeneratedFlights?: boolean; db?: DbClient } = {}) {
  const db = options.db ?? prisma;
  const excludeScheduleId = options.excludeScheduleId ?? proposed.scheduleId;
  const [route, fleet, aircraft, existingSchedules, generatedFlights] = await Promise.all([
    db.route.findUnique({ where: { id: proposed.routeId }, include: { departureAirport: true, arrivalAirport: true, fleetAssignments: true, fleetCompatibility: true } }),
    proposed.defaultFleetId ? db.fleet.findUnique({ where: { id: proposed.defaultFleetId } }) : null,
    proposed.assignedAircraftId ? db.aircraft.findUnique({ where: { id: proposed.assignedAircraftId }, include: { nativeFleet: true, conditionSnapshot: true } }) : null,
    proposed.assignedAircraftId && validDate(proposed.effectiveFrom) ? db.flightSchedule.findMany({ where: { assignedAircraftId: proposed.assignedAircraftId, id: excludeScheduleId ? { not: excludeScheduleId } : undefined, status: { in: ["DRAFT", "ACTIVE", "SUSPENDED"] }, effectiveFrom: proposed.effectiveUntil && validDate(proposed.effectiveUntil) ? { lte: proposed.effectiveUntil } : undefined, OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: proposed.effectiveFrom } }] }, include: { route: { select: { departureAirportId: true, arrivalAirportId: true } } } }) : [],
    proposed.assignedAircraftId && options.includeExistingGeneratedFlights !== false ? db.flight.findMany({ where: { assignedAircraftId: proposed.assignedAircraftId, status: { notIn: ["COMPLETED", "CANCELLED", "EXPIRED"] }, scheduledArrival: { gt: new Date() }, scheduledDeparture: proposed.effectiveUntil && validDate(proposed.effectiveUntil) ? { lte: proposed.effectiveUntil } : undefined }, select: { id: true, scheduleId: true, routeId: true, assignedAircraftId: true, scheduledDeparture: true, scheduledArrival: true, status: true, manuallyModifiedAt: true } }) : [],
  ]);
  return validateProposedScheduleWithContext(proposed, { route, fleet, aircraft, existingSchedules, generatedFlights }, options);
}

export type { ProposedFlightSchedule, ScheduleValidationIssue, ScheduleValidationResult } from "./types";
