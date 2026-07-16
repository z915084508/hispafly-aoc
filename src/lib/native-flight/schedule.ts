import { createHash } from "node:crypto";
import { AocDataOrigin, FlightScheduleStatus, NativeFlightStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatMinutes, parseIsoDate, resolveLocalDateTime } from "./schedule-time";
import { planScheduleOccurrences, validateScheduleRule } from "./schedule-rules";
import { checkAircraftAvailability } from "./availability";

export type GenerationResult = {
  scheduleId: string;
  from: string;
  to: string;
  planned: number;
  created: number;
  skipped: number;
  errors: Array<{ operatingDate: string; code: string; message: string }>;
};

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function stableGenerationKey(scheduleId: string, operatingDate: string) {
  return createHash("sha256").update(`${scheduleId}:${operatingDate}`).digest("hex");
}

export async function previewScheduleGeneration(scheduleId: string, from: string, to: string) {
  const schedule = await prisma.flightSchedule.findUnique({
    where: { id: scheduleId },
    include: { route: { include: { departureAirport: true, arrivalAirport: true } } },
  });
  if (!schedule) throw new Error("schedule_not_found");

  const input = {
    scheduleId,
    daysOfWeek: schedule.daysOfWeek,
    departureLocalTimeMinutes: schedule.departureLocalTimeMinutes,
    departureTimezone: schedule.departureTimezone,
    arrivalTimezone: schedule.arrivalTimezone,
    scheduledDurationMinutes: schedule.scheduledDurationMinutes,
    effectiveFrom: dateOnly(schedule.effectiveFrom),
    effectiveUntil: schedule.effectiveUntil ? dateOnly(schedule.effectiveUntil) : null,
    from,
    to,
  };
  const validationErrors = validateScheduleRule(input);
  if (validationErrors.length) return { schedule, occurrences: [], validationErrors };
  return { schedule, occurrences: planScheduleOccurrences(input), validationErrors: [] };
}

export async function generateFlightsForSchedule(scheduleId: string, from: string, to: string): Promise<GenerationResult> {
  const preview = await previewScheduleGeneration(scheduleId, from, to);
  const result: GenerationResult = {
    scheduleId,
    from,
    to,
    planned: preview.occurrences.length,
    created: 0,
    skipped: 0,
    errors: preview.validationErrors.map((error) => ({ operatingDate: "", code: error.code, message: error.message })),
  };
  if (preview.schedule.status !== FlightScheduleStatus.ACTIVE) {
    result.errors.push({ operatingDate: "", code: "SCHEDULE_NOT_ACTIVE", message: "Only active schedules generate flights." });
    return result;
  }

  const { schedule } = preview;
  const route = schedule.route;
  if (!route.departureAirportId || !route.arrivalAirportId) {
    result.errors.push({ operatingDate: "", code: "ROUTE_AIRPORTS_REQUIRED", message: "The route must reference native airports." });
    return result;
  }

  for (const occurrence of preview.occurrences) {
    if (!occurrence.ok) {
      result.errors.push(occurrence);
      continue;
    }
    const generationKey = stableGenerationKey(schedule.id, occurrence.operatingDate);
    const operatingDateParts = parseIsoDate(occurrence.operatingDate)!;
    const operatingDate = new Date(Date.UTC(operatingDateParts.year, operatingDateParts.month - 1, operatingDateParts.day));
    const bookingOpenAt = new Date(occurrence.scheduledDeparture.getTime() - schedule.bookingOpenOffsetMinutes * 60_000);
    const bookingCloseAt = new Date(occurrence.scheduledDeparture.getTime() - schedule.bookingCloseOffsetMinutes * 60_000);

    try {
      await prisma.flight.create({
        data: {
          dataOrigin: AocDataOrigin.HISPAFLY_NATIVE,
          routeId: route.id,
          departureAirportId: route.departureAirportId,
          arrivalAirportId: route.arrivalAirportId,
          scheduleId: schedule.id,
          operatingDate,
          scheduledDeparture: occurrence.scheduledDeparture,
          scheduledArrival: occurrence.scheduledArrival,
          scheduledDurationMinutes: schedule.scheduledDurationMinutes,
          flightNumber: route.flightNumber || schedule.code,
          callsign: route.callsign || route.flightNumber || schedule.code,
          departureIcao: route.departureAirport?.icao || route.departure,
          arrivalIcao: route.arrivalAirport?.icao || route.arrival,
          departureTimezone: schedule.departureTimezone,
          arrivalTimezone: schedule.arrivalTimezone,
          departureLocalTime: formatMinutes(schedule.departureLocalTimeMinutes),
          arrivalLocalTime: formatMinutes(schedule.arrivalLocalTimeMinutes ?? 0),
          fleetId: schedule.defaultFleetId,
          assignedAircraftId: schedule.assignedAircraftId,
          bookingOpenAt,
          bookingCloseAt,
          generationKey,
          status: bookingOpenAt <= new Date() ? NativeFlightStatus.OPEN_FOR_BOOKING : NativeFlightStatus.SCHEDULED,
        },
      });
      result.created += 1;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        result.skipped += 1;
      } else {
        result.errors.push({ operatingDate: occurrence.operatingDate, code: "CREATE_FAILED", message: "Flight creation failed." });
      }
    }
  }
  return result;
}

export async function generateActiveSchedules(from: string, to: string) {
  const schedules = await prisma.flightSchedule.findMany({
    where: {
      status: FlightScheduleStatus.ACTIVE,
      effectiveFrom: { lte: new Date(`${to}T23:59:59.999Z`) },
      OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: new Date(`${from}T00:00:00.000Z`) } }],
    },
    select: { id: true },
  });
  return Promise.all(schedules.map((schedule) => generateFlightsForSchedule(schedule.id, from, to)));
}

export async function createManualFlight(input: {
  routeId: string;
  operatingDate: string;
  departureLocalTimeMinutes: number;
  departureTimezone: string;
  arrivalTimezone: string;
  scheduledDurationMinutes: number;
  fleetId?: string | null;
  assignedAircraftId?: string | null;
  notes?: string | null;
}) {
  const route = await prisma.route.findUnique({
    where: { id: input.routeId },
    include: { departureAirport: true, arrivalAirport: true },
  });
  const date = parseIsoDate(input.operatingDate);
  if (!route || !date || !route.departureAirportId || !route.arrivalAirportId) throw new Error("invalid_manual_flight");
  const departure = resolveLocalDateTime(date, input.departureLocalTimeMinutes, input.departureTimezone);
  if (!departure.ok) throw new Error(departure.code);
  const scheduledArrival = new Date(departure.instant.getTime() + input.scheduledDurationMinutes * 60_000);
  if (input.assignedAircraftId) {
    const availability = await checkAircraftAvailability({
      aircraftId: input.assignedAircraftId,
      routeId: route.id,
      departureAirportId: route.departureAirportId,
      startsAt: departure.instant,
      endsAt: scheduledArrival,
    });
    if (!availability.allowed) throw new Error(availability.blockingReasons.join(" "));
  }

  return prisma.flight.create({
    data: {
      dataOrigin: AocDataOrigin.HISPAFLY_NATIVE,
      routeId: route.id,
      departureAirportId: route.departureAirportId,
      arrivalAirportId: route.arrivalAirportId,
      operatingDate: new Date(Date.UTC(date.year, date.month - 1, date.day)),
      scheduledDeparture: departure.instant,
      scheduledArrival,
      scheduledDurationMinutes: input.scheduledDurationMinutes,
      flightNumber: route.flightNumber || route.routeCode || "HF",
      callsign: route.callsign || route.flightNumber || route.routeCode || "HF",
      departureIcao: route.departureAirport?.icao || route.departure,
      arrivalIcao: route.arrivalAirport?.icao || route.arrival,
      departureTimezone: input.departureTimezone,
      arrivalTimezone: input.arrivalTimezone,
      departureLocalTime: formatMinutes(input.departureLocalTimeMinutes),
      arrivalLocalTime: "",
      fleetId: input.fleetId,
      assignedAircraftId: input.assignedAircraftId,
      operatingType: "MANUAL",
      notes: input.notes,
      manuallyModifiedAt: new Date(),
    },
  });
}

export async function cancelNativeFlight(flightId: string, reason: string) {
  const flight = await prisma.flight.findUnique({ where: { id: flightId }, include: { bookings: true, dispatches: true } });
  if (!flight) throw new Error("flight_not_found");
  if (flight.status === NativeFlightStatus.COMPLETED) throw new Error("completed_flight_cannot_be_cancelled");
  return prisma.flight.update({
    where: { id: flightId },
    data: { status: NativeFlightStatus.CANCELLED, notes: [flight.notes, `Cancellation: ${reason}`].filter(Boolean).join("\n") },
  });
}

export async function assignAircraftToFlight(flightId: string, aircraftId: string) {
  const flight = await prisma.flight.findUnique({ where: { id: flightId } });
  if (!flight) throw new Error("flight_not_found");
  if (flight.assignedAircraftId) throw new Error("flight_already_has_aircraft");
  const availability = await checkAircraftAvailability({
    aircraftId,
    routeId: flight.routeId,
    departureAirportId: flight.departureAirportId,
    startsAt: flight.scheduledDeparture,
    endsAt: flight.scheduledArrival,
  });
  if (!availability.allowed) throw new Error(availability.blockingReasons.join(" "));
  return prisma.flight.update({ where: { id: flightId }, data: { assignedAircraftId: aircraftId } });
}
