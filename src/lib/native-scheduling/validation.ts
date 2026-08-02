import { fleetIsAuthorized } from "../native-flight/self-dispatch-rules.ts";
import { MAX_SCHEDULE_DURATION_MINUTES, MINUTES_PER_DAY, SCHEDULE_DURATION_TOLERANCE_MINUTES } from "./constants.ts";
import { validateAircraftScheduleConflicts } from "./conflicts.ts";
import { proposedWindowForDate, utcDayOfWeek, validDate } from "./time.ts";
import type { ProposedFlightSchedule, ScheduleValidationContext, ScheduleValidationIssue, ScheduleValidationResult } from "./types.ts";

const issue = (code: string, message: string, proposed: ProposedFlightSchedule, extra: Partial<ScheduleValidationIssue> = {}): ScheduleValidationIssue => ({ code, severity: "ERROR", message, scheduleId: proposed.scheduleId, routeId: proposed.routeId, ...extra });
const blockedAircraftStates = new Set(["MAINTENANCE", "FERRY_ONLY", "AOG", "SUSPENDED", "RETIRED", "UNKNOWN"]);
const blockedConditionStates = new Set(["AOG", "IN_MAINTENANCE"]);
const blockedMaintenanceStates = new Set(["REQUIRED", "WAITING_MAINTENANCE", "IN_PROGRESS"]);

export function validateProposedScheduleWithContext(proposed: ProposedFlightSchedule, context: ScheduleValidationContext, options: { includeExistingGeneratedFlights?: boolean } = {}): ScheduleValidationResult {
  const errors: ScheduleValidationIssue[] = [], warnings: ScheduleValidationIssue[] = [];
  const uniqueDays = new Set<number>();
  if (!proposed.daysOfWeek.length) errors.push(issue("NO_OPERATING_DAYS", "Select at least one operating day.", proposed));
  for (const day of proposed.daysOfWeek) {
    if (!Number.isInteger(day) || day < 1 || day > 7) errors.push(issue("INVALID_OPERATING_DAY", "Operating days must use 1 (Monday) through 7 (Sunday).", proposed, { dayOfWeek: day }));
    else if (uniqueDays.has(day)) errors.push(issue("DUPLICATED_OPERATING_DAY", `Operating day ${day} is selected more than once.`, proposed, { dayOfWeek: day }));
    uniqueDays.add(day);
  }
  if (!validDate(proposed.effectiveFrom)) errors.push(issue("INVALID_EFFECTIVE_FROM", "Effective from must be a valid date.", proposed));
  if (proposed.effectiveUntil && (!validDate(proposed.effectiveUntil) || proposed.effectiveUntil < proposed.effectiveFrom)) errors.push(issue("INVALID_EFFECTIVE_PERIOD", "Effective until cannot be before effective from.", proposed));
  if (!Number.isInteger(proposed.departureTimeMinutesUtc) || proposed.departureTimeMinutesUtc < 0 || proposed.departureTimeMinutesUtc >= MINUTES_PER_DAY) errors.push(issue("INVALID_DEPARTURE_TIME", "Departure time must be between 0 and 1439 UTC minutes.", proposed));
  if (!Number.isInteger(proposed.arrivalTimeMinutesUtc) || proposed.arrivalTimeMinutesUtc < 0 || proposed.arrivalTimeMinutesUtc >= MINUTES_PER_DAY) errors.push(issue("INVALID_ARRIVAL_TIME", "Arrival time must be between 0 and 1439 UTC minutes.", proposed));
  if (!Number.isInteger(proposed.scheduledDurationMinutes) || proposed.scheduledDurationMinutes < 1 || proposed.scheduledDurationMinutes > MAX_SCHEDULE_DURATION_MINUTES) errors.push(issue("INVALID_DURATION", `Duration must be between 1 and ${MAX_SCHEDULE_DURATION_MINUTES} minutes.`, proposed));
  if (proposed.departureTimeMinutesUtc >= 0 && proposed.arrivalTimeMinutesUtc >= 0 && proposed.scheduledDurationMinutes > 0) {
    const calculatedArrival = (proposed.departureTimeMinutesUtc + proposed.scheduledDurationMinutes) % MINUTES_PER_DAY;
    const difference = Math.min(Math.abs(calculatedArrival - proposed.arrivalTimeMinutesUtc), MINUTES_PER_DAY - Math.abs(calculatedArrival - proposed.arrivalTimeMinutesUtc));
    if (difference > SCHEDULE_DURATION_TOLERANCE_MINUTES) errors.push(issue("TIME_DURATION_MISMATCH", "Arrival time does not match departure time and scheduled duration.", proposed, { details: { toleranceMinutes: SCHEDULE_DURATION_TOLERANCE_MINUTES, calculatedArrivalTimeMinutesUtc: calculatedArrival } }));
  }

  const route = context.route;
  if (!route) errors.push(issue("ROUTE_NOT_FOUND", "The selected route does not exist.", proposed));
  else {
    if (!route.active || route.archivedAt || route.operationalStatus !== "ACTIVE") errors.push(issue("ROUTE_NOT_OPERATIONAL", "The selected route is not operationally active.", proposed));
    if (!route.departureAirportId || !route.arrivalAirportId || !route.departureAirport || !route.arrivalAirport) errors.push(issue("ROUTE_AIRPORTS_MISSING", "The route must reference valid departure and arrival airports.", proposed));
    else {
      if (route.departureAirportId === route.arrivalAirportId) errors.push(issue("SAME_DEPARTURE_AND_ARRIVAL", "Departure and arrival airports must be different.", proposed));
      if (route.departureAirport.status !== "ACTIVE" || route.arrivalAirport.status !== "ACTIVE") errors.push(issue("AIRPORT_NOT_OPERATIONAL", "Both route airports must be operationally active.", proposed, { details: { departureStatus: route.departureAirport.status, arrivalStatus: route.arrivalAirport.status } }));
    }
  }

  if (proposed.defaultFleetId) {
    const fleet = context.fleet;
    if (!fleet) errors.push(issue("FLEET_NOT_FOUND", "The selected default fleet does not exist.", proposed));
    else if (!fleet.active || fleet.archivedAt || fleet.operationalStatus !== "ACTIVE") errors.push(issue("FLEET_NOT_OPERATIONAL", "The selected default fleet is not operationally active.", proposed));
    if (route && (!fleetIsAuthorized(route.fleetAssignments.map(({ fleetId }) => fleetId), proposed.defaultFleetId) || route.fleetCompatibility.some((row) => row.fleetId === proposed.defaultFleetId && row.policy === "FORBIDDEN"))) errors.push(issue("FLEET_NOT_COMPATIBLE", "The selected default fleet is not allowed on this route.", proposed));
  }

  if (proposed.assignedAircraftId) {
    const aircraft = context.aircraft;
    if (!aircraft) errors.push(issue("AIRCRAFT_NOT_FOUND", "The assigned aircraft does not exist.", proposed, { aircraftId: proposed.assignedAircraftId }));
    else {
      if (aircraft.archivedAt || blockedAircraftStates.has(aircraft.operationalStatus) || !aircraft.nativeFleet || aircraft.nativeFleet.operationalStatus !== "ACTIVE") errors.push(issue("AIRCRAFT_NOT_OPERATIONAL", "The assigned aircraft is not operationally schedulable.", proposed, { aircraftId: aircraft.id }));
      if (aircraft.conditionSnapshot && (blockedConditionStates.has(aircraft.conditionSnapshot.operationalStatus) || blockedMaintenanceStates.has(aircraft.conditionSnapshot.maintenanceStatus))) errors.push(issue("AIRCRAFT_IN_MAINTENANCE", "The assigned aircraft is in active maintenance or AOG.", proposed, { aircraftId: aircraft.id }));
      if (proposed.defaultFleetId && aircraft.nativeFleetId !== proposed.defaultFleetId) errors.push(issue("AIRCRAFT_FLEET_MISMATCH", "The assigned aircraft does not belong to the selected default fleet.", proposed, { aircraftId: aircraft.id }));
      if (route && aircraft.nativeFleetId && (!fleetIsAuthorized(route.fleetAssignments.map(({ fleetId }) => fleetId), aircraft.nativeFleetId) || route.fleetCompatibility.some((row) => row.fleetId === aircraft.nativeFleetId && row.policy === "FORBIDDEN"))) errors.push(issue("AIRCRAFT_ROUTE_INCOMPATIBLE", "The assigned aircraft fleet is not allowed on this route.", proposed, { aircraftId: aircraft.id }));
    }
    if (route?.departureAirportId && route.arrivalAirportId) errors.push(...validateAircraftScheduleConflicts(proposed, route, context.existingSchedules));
  }

  if (options.includeExistingGeneratedFlights !== false && proposed.assignedAircraftId && validDate(proposed.effectiveFrom)) for (const flight of context.generatedFlights) {
    if (flight.assignedAircraftId !== proposed.assignedAircraftId || ["COMPLETED", "CANCELLED", "EXPIRED"].includes(flight.status)) continue;
    if (flight.scheduleId === proposed.scheduleId && !flight.manuallyModifiedAt) continue;
    if (!proposed.daysOfWeek.includes(utcDayOfWeek(flight.scheduledDeparture))) continue;
    if (flight.scheduledDeparture < proposed.effectiveFrom || (proposed.effectiveUntil && flight.scheduledDeparture > proposed.effectiveUntil)) continue;
    const window = proposedWindowForDate(flight.scheduledDeparture, proposed.departureTimeMinutesUtc, proposed.scheduledDurationMinutes);
    if (window.startsAt < flight.scheduledArrival && window.endsAt > flight.scheduledDeparture) errors.push(issue("GENERATED_FLIGHT_CONFLICT", "The proposed schedule overlaps an existing future Flight.", proposed, { aircraftId: proposed.assignedAircraftId, dayOfWeek: utcDayOfWeek(flight.scheduledDeparture), startsAt: window.startsAt, endsAt: window.endsAt, details: { flightId: flight.id, flightScheduleId: flight.scheduleId, flightStartsAt: flight.scheduledDeparture, flightEndsAt: flight.scheduledArrival, manuallyModified: Boolean(flight.manuallyModifiedAt) } }));
  }

  const days = [...uniqueDays].filter((day) => day >= 1 && day <= 7).sort().map((dayOfWeek) => { const dayIssues = errors.filter((item) => item.dayOfWeek === dayOfWeek); return { dayOfWeek, valid: dayIssues.length === 0, issues: dayIssues }; });
  return { valid: errors.length === 0, errors, warnings, days };
}

export type { ProposedFlightSchedule, ScheduleValidationIssue, ScheduleValidationResult } from "./types.ts";
