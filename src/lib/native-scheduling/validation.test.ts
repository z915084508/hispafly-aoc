import assert from "node:assert/strict";
import { validateProposedScheduleWithContext } from "./validation.ts";
import type { ExistingSchedule, ProposedFlightSchedule, ScheduleValidationContext } from "./types.ts";

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
const proposed = (override: Partial<ProposedFlightSchedule> = {}): ProposedFlightSchedule => ({ scheduleId: "proposed", routeId: "route-a-b", daysOfWeek: [1], departureTimeMinutesUtc: 480, arrivalTimeMinutesUtc: 540, scheduledDurationMinutes: 60, defaultFleetId: "fleet-a", assignedAircraftId: "aircraft-a", effectiveFrom: date("2026-08-10"), effectiveUntil: date("2026-12-31"), ...override });
const schedule = (override: Partial<ExistingSchedule> = {}): ExistingSchedule => ({ id: "existing", routeId: "route-b-a", daysOfWeek: [1], departureTimeMinutesUtc: 600, scheduledDurationMinutes: 60, assignedAircraftId: "aircraft-a", status: "ACTIVE", effectiveFrom: date("2026-01-01"), effectiveUntil: date("2026-12-31"), route: { departureAirportId: "airport-b", arrivalAirportId: "airport-a" }, ...override });
const context = (override: Partial<ScheduleValidationContext> = {}): ScheduleValidationContext => ({
  route: { id: "route-a-b", active: true, operationalStatus: "ACTIVE", archivedAt: null, departureAirportId: "airport-a", arrivalAirportId: "airport-b", departureAirport: { id: "airport-a", icao: "LEVC", status: "ACTIVE" }, arrivalAirport: { id: "airport-b", icao: "LEMD", status: "ACTIVE" }, fleetAssignments: [{ fleetId: "fleet-a" }], fleetCompatibility: [{ fleetId: "fleet-a", policy: "ALLOWED" }] },
  fleet: { id: "fleet-a", operationalStatus: "ACTIVE", active: true, archivedAt: null },
  aircraft: { id: "aircraft-a", nativeFleetId: "fleet-a", operationalStatus: "AVAILABLE", archivedAt: null, conditionSnapshot: { operationalStatus: "NORMAL", maintenanceStatus: "NONE" }, nativeFleet: { id: "fleet-a", operationalStatus: "ACTIVE", active: true, archivedAt: null } },
  existingSchedules: [], generatedFlights: [], ...override,
});
const codes = (input: ProposedFlightSchedule, ctx: ScheduleValidationContext = context()) => validateProposedScheduleWithContext(input, ctx).errors.map(({ code }) => code);

assert.equal(validateProposedScheduleWithContext(proposed(), context()).valid, true, "valid single scheduled flight");
assert.ok(codes(proposed({ daysOfWeek: [0] })).includes("INVALID_OPERATING_DAY"));
assert.ok(codes(proposed({ daysOfWeek: [1, 1] })).includes("DUPLICATED_OPERATING_DAY"));
assert.ok(codes(proposed({ effectiveUntil: date("2026-08-09") })).includes("INVALID_EFFECTIVE_PERIOD"));
assert.ok(codes(proposed(), context({ route: { ...context().route!, arrivalAirportId: "airport-a", arrivalAirport: { id: "airport-a", icao: "LEVC", status: "ACTIVE" } } })).includes("SAME_DEPARTURE_AND_ARRIVAL"));
assert.ok(codes(proposed(), context({ route: { ...context().route!, operationalStatus: "SUSPENDED" } })).includes("ROUTE_NOT_OPERATIONAL"));
assert.ok(codes(proposed(), context({ route: { ...context().route!, fleetCompatibility: [{ fleetId: "fleet-a", policy: "FORBIDDEN" }] } })).includes("FLEET_NOT_COMPATIBLE"));
assert.ok(codes(proposed(), context({ aircraft: { ...context().aircraft!, operationalStatus: "AOG" } })).includes("AIRCRAFT_NOT_OPERATIONAL"));

assert.equal(validateProposedScheduleWithContext(proposed(), context({ existingSchedules: [schedule()] })).valid, true, "non-overlap, turnaround and continuity should pass");
assert.ok(codes(proposed(), context({ existingSchedules: [schedule({ departureTimeMinutesUtc: 530 })] })).includes("AIRCRAFT_SCHEDULE_OVERLAP"));
assert.ok(codes(proposed(), context({ existingSchedules: [schedule({ departureTimeMinutesUtc: 560 })] })).includes("INSUFFICIENT_TURNAROUND"));
assert.equal(codes(proposed(), context({ existingSchedules: [schedule()] })).includes("AIRCRAFT_LOCATION_DISCONTINUITY"), false);
assert.ok(codes(proposed(), context({ existingSchedules: [schedule({ route: { departureAirportId: "airport-x", arrivalAirportId: "airport-c" } })] })).includes("AIRCRAFT_LOCATION_DISCONTINUITY"));

assert.equal(validateProposedScheduleWithContext(proposed({ departureTimeMinutesUtc: 1410, arrivalTimeMinutesUtc: 90, scheduledDurationMinutes: 120 }), context()).valid, true, "overnight flight should pass");
assert.ok(codes(proposed({ departureTimeMinutesUtc: 1410, arrivalTimeMinutesUtc: 90, scheduledDurationMinutes: 120 }), context({ existingSchedules: [schedule({ daysOfWeek: [2], departureTimeMinutesUtc: 30 })] })).includes("AIRCRAFT_SCHEDULE_OVERLAP"));
assert.equal(validateProposedScheduleWithContext(proposed({ daysOfWeek: [7], departureTimeMinutesUtc: 1320, arrivalTimeMinutesUtc: 0, scheduledDurationMinutes: 120 }), context({ existingSchedules: [schedule({ daysOfWeek: [1], departureTimeMinutesUtc: 60, route: { departureAirportId: "airport-b", arrivalAirportId: "airport-a" } })] })).valid, true, "Sunday-to-Monday continuity should pass");
assert.ok(codes(proposed({ daysOfWeek: [7], departureTimeMinutesUtc: 1410, arrivalTimeMinutesUtc: 90, scheduledDurationMinutes: 120 }), context({ existingSchedules: [schedule({ daysOfWeek: [1], departureTimeMinutesUtc: 30 })] })).includes("AIRCRAFT_WEEK_BOUNDARY_OVERLAP"));
assert.equal(validateProposedScheduleWithContext(proposed(), context({ existingSchedules: [schedule({ id: "proposed", departureTimeMinutesUtc: 480 })] })).valid, true, "editing must not self-conflict");
assert.equal(validateProposedScheduleWithContext(proposed(), context({ existingSchedules: [schedule({ assignedAircraftId: "aircraft-b", departureTimeMinutesUtc: 480 })] })).valid, true, "different aircraft may operate simultaneously");
assert.equal(validateProposedScheduleWithContext(proposed(), context({ existingSchedules: [schedule({ departureTimeMinutesUtc: 480, effectiveUntil: date("2026-08-09") })] })).valid, true, "non-overlapping effective periods must not conflict");

const generatedContext = context({ generatedFlights: [{ id: "flight-1", scheduleId: "other", routeId: "route-b-c", assignedAircraftId: "aircraft-a", scheduledDeparture: new Date("2026-08-10T08:30:00.000Z"), scheduledArrival: new Date("2026-08-10T09:30:00.000Z"), status: "SCHEDULED", manuallyModifiedAt: new Date("2026-08-01T00:00:00.000Z") }] });
assert.ok(codes(proposed(), generatedContext).includes("GENERATED_FLIGHT_CONFLICT"));

const activeConflict = validateProposedScheduleWithContext(proposed(), context({ existingSchedules: [schedule({ status: "ACTIVE", departureTimeMinutesUtc: 530 })] }));
assert.ok(activeConflict.errors.some(({ code }) => code === "AIRCRAFT_SCHEDULE_OVERLAP"));
assert.ok(activeConflict.days.find(({ dayOfWeek }) => dayOfWeek === 1)?.issues.some(({ code }) => code === "AIRCRAFT_SCHEDULE_OVERLAP"), "day errors must be aggregated");
assert.equal(activeConflict.days.find(({ dayOfWeek }) => dayOfWeek === 1)?.valid, false);
assert.ok(codes(proposed(), context({ existingSchedules: [schedule({ status: "DRAFT", departureTimeMinutesUtc: 530 })] })).includes("AIRCRAFT_SCHEDULE_OVERLAP"));
const suspendedConflict = validateProposedScheduleWithContext(proposed(), context({ existingSchedules: [schedule({ status: "SUSPENDED", departureTimeMinutesUtc: 530 })] }));
assert.equal(suspendedConflict.valid, true);
assert.ok(suspendedConflict.warnings.some(({ code }) => code === "SUSPENDED_SCHEDULE_CONFLICT"));
assert.ok(suspendedConflict.days[0]?.issues.some(({ code }) => code === "SUSPENDED_SCHEDULE_CONFLICT"), "day warnings must be aggregated");
assert.equal(suspendedConflict.days[0]?.valid, true, "warning-only days remain valid");
assert.equal(validateProposedScheduleWithContext(proposed(), context({ existingSchedules: [schedule({ status: "EXPIRED", departureTimeMinutesUtc: 530 })] })).valid, true);
assert.equal(validateProposedScheduleWithContext(proposed(), context({ existingSchedules: [schedule({ status: "ARCHIVED", departureTimeMinutesUtc: 530 })] })).valid, true);

console.log("Native scheduling validation rules passed (30 focused scenarios).");
