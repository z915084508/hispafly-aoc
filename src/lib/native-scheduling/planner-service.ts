import { NativeAircraftStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { validateProposedSchedule } from "./service";
import { toProposedSchedule } from "./presentation";
import { buildPlannerWeek, normalizeWeekStartUtc, type PlannerSchedule } from "./planner";

const aircraftInclude = { nativeFleet: true, currentAirport: true, conditionSnapshot: true } as const;
const scheduleInclude = { route: { include: { departureAirport: true, arrivalAirport: true } }, defaultFleet: true, assignedAircraft: true } as const;
const blockedAircraft: NativeAircraftStatus[] = [NativeAircraftStatus.AOG, NativeAircraftStatus.MAINTENANCE, NativeAircraftStatus.FERRY_ONLY, NativeAircraftStatus.SUSPENDED, NativeAircraftStatus.RETIRED];

export async function getWeeklyAircraftPlannerData(input: { aircraftId?: string | null; weekStartUtc: Date; includeExpired?: boolean }) {
  const weekStartUtc = normalizeWeekStartUtc(input.weekStartUtc), weekEndUtc = new Date(weekStartUtc.getTime() + 7 * 86_400_000);
  const aircraftRows = await prisma.aircraft.findMany({ where: { archivedAt: null, operationMode: { in: ["SCHEDULED", "FLEX"] }, operationalStatus: { notIn: blockedAircraft } }, include: aircraftInclude, orderBy: { registration: "asc" }, take: 250 });
  const aircraft = aircraftRows.map((item) => ({ id:item.id, registration:item.registration, aircraftType:item.aircraftType, operationalStatus:item.operationalStatus, nativeFleetId:item.nativeFleetId, nativeFleet:item.nativeFleet ? { id:item.nativeFleet.id, code:item.nativeFleet.code, name:item.nativeFleet.name } : null, currentAirport:item.currentAirport ? { icao:item.currentAirport.icao } : null, conditionSnapshot:item.conditionSnapshot ? { operationalStatus:item.conditionSnapshot.operationalStatus } : null }));
  const requested = input.aircraftId === "unassigned" ? null : aircraft.find(({ id }) => id === input.aircraftId) ?? aircraft[0] ?? null;
  const unassigned = input.aircraftId === "unassigned";
  const statuses = input.includeExpired ? ["DRAFT", "ACTIVE", "SUSPENDED", "EXPIRED"] as const : ["DRAFT", "ACTIVE", "SUSPENDED"] as const;
  const schedules = await prisma.flightSchedule.findMany({ where: { assignedAircraftId: unassigned ? null : requested?.id ?? "__none__", status: { in: [...statuses] }, effectiveFrom: { lt: weekEndUtc }, OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: weekStartUtc } }] }, include: scheduleInclude, orderBy: [{ departureTimeMinutesUtc: "asc" }, { code: "asc" }], take: unassigned ? 100 : 250 });
  const scheduleIds = schedules.map(({ id }) => id);
  const flights = scheduleIds.length ? await prisma.flight.findMany({ where: { scheduleId: { in: scheduleIds }, operatingDate: { gte: weekStartUtc, lt: weekEndUtc } }, select: { id: true, scheduleId: true, operatingDate: true, status: true, generationKey: true }, take: 500 }) : [];
  // Bounded to one rotation/week. Validation remains isolated per Schedule until a batch validator is introduced.
  const validations = await Promise.all(schedules.map((schedule) => validateProposedSchedule(toProposedSchedule(schedule), { excludeScheduleId: schedule.id })));
  const plannerSchedules: PlannerSchedule[] = schedules.map((schedule, index) => ({ ...schedule, validation: validations[index] }));
  const week = buildPlannerWeek({ weekStartUtc, schedules: plannerSchedules, flights, includeExpired: input.includeExpired });
  return { aircraft, selectedAircraft: requested, unassigned, week, schedules: plannerSchedules, flights };
}

export function buildDevelopmentPlannerData(weekInput = new Date()) {
  const weekStartUtc = normalizeWeekStartUtc(weekInput);
  const aircraft = [{ id: "demo-aircraft", registration: "EC-VLC", aircraftType: "A321neo", operationalStatus: "ACTIVE", nativeFleetId: "demo-fleet", nativeFleet: { id: "demo-fleet", code: "A21N", name: "A321neo" }, currentAirport: { icao: "LEVC" }, conditionSnapshot: { operationalStatus: "AVAILABLE" } }];
  const valid = { valid: true, errors: [], warnings: [], days: [1,2,3,4,5,6,7].map((dayOfWeek) => ({ dayOfWeek, valid: true, issues: [] })) };
  const schedules: PlannerSchedule[] = [
    { id: "demo-101", code: "HFY101-AM", status: "ACTIVE", daysOfWeek: [1,2,3,4,5], departureTimeMinutesUtc: 480, scheduledDurationMinutes: 65, effectiveFrom: weekStartUtc, effectiveUntil: null, route: { flightNumber: "HFY101", departure: "LEVC", arrival: "LEMD" }, defaultFleet: { code: "A21N" }, assignedAircraft: { registration: "EC-VLC" }, validation: valid },
    { id: "demo-102", code: "HFY102-RT", status: "DRAFT", daysOfWeek: [1,2,3,4,5], departureTimeMinutesUtc: 620, scheduledDurationMinutes: 70, effectiveFrom: weekStartUtc, effectiveUntil: null, route: { flightNumber: "HFY102", departure: "LEMD", arrival: "LEVC" }, defaultFleet: { code: "A21N" }, assignedAircraft: { registration: "EC-VLC" }, validation: { ...valid, valid: false, errors: [{ code: "INSUFFICIENT_TURNAROUND", severity: "ERROR", message: "Turnaround insuficiente.", dayOfWeek: 1 }], days: valid.days.map((day) => day.dayOfWeek === 1 ? { ...day, valid: false, issues: [{ code: "INSUFFICIENT_TURNAROUND", severity: "ERROR" as const, message: "Turnaround insuficiente.", dayOfWeek: 1 }] } : day) } },
    { id: "demo-450", code: "HFY450-NIGHT", status: "SUSPENDED", daysOfWeek: [3,6], departureTimeMinutesUtc: 1320, scheduledDurationMinutes: 180, effectiveFrom: weekStartUtc, effectiveUntil: null, route: { flightNumber: "HFY450", departure: "LEVC", arrival: "GCTS" }, defaultFleet: { code: "A21N" }, assignedAircraft: { registration: "EC-VLC" }, validation: { ...valid, warnings: [{ code: "SUSPENDED_SCHEDULE_CONFLICT", severity: "WARNING", message: "Programación suspendida visible para planificación.", dayOfWeek: 3 }], days: valid.days.map((day) => day.dayOfWeek === 3 ? { ...day, issues: [{ code: "SUSPENDED_SCHEDULE_CONFLICT", severity: "WARNING" as const, message: "Programación suspendida visible para planificación.", dayOfWeek: 3 }] } : day) } },
  ];
  const flights = [{ id: "flight-demo-1", scheduleId: "demo-101", operatingDate: weekStartUtc, status: "OPEN_FOR_BOOKING", generationKey: `schedule:demo-101:${weekStartUtc.toISOString().slice(0,10)}` }];
  return { aircraft, selectedAircraft: aircraft[0], unassigned: false, week: buildPlannerWeek({ weekStartUtc, schedules, flights }), schedules, flights };
}
