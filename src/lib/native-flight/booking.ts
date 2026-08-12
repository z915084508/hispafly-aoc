import { AocDataOrigin, FlightDispatchStatus, NativeFlightStatus, PilotBookingStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLogSafely } from "@/lib/audit/log";
import { assertNativeIds, assertNativeOrigin } from "@/lib/native-cutover/write-gate";
import { resolveAircraftState } from "./aircraft-state";

const ACTIVE_BOOKING_STATUSES: PilotBookingStatus[] = [
  PilotBookingStatus.PENDING,
  PilotBookingStatus.CONFIRMED,
  PilotBookingStatus.DISPATCH_PENDING,
  PilotBookingStatus.DISPATCHED,
  PilotBookingStatus.IN_PROGRESS,
  PilotBookingStatus.BOOKED,
];
const BOOKABLE_FLIGHT_STATUSES: NativeFlightStatus[] = [
  NativeFlightStatus.SCHEDULED,
  NativeFlightStatus.OPEN,
  NativeFlightStatus.OPEN_FOR_BOOKING,
];
const TURNAROUND_BUFFER_MINUTES = 45;

export type EligibilityResult = {
  allowed: boolean;
  blockingReasons: string[];
  warnings: string[];
  checkedAt: Date;
};

type DbClient = Prisma.TransactionClient | typeof prisma;

export async function checkPilotEligibility(
  pilotId: string,
  flight: { id: string; scheduledDeparture: Date; scheduledArrival: Date },
  db: DbClient = prisma,
): Promise<EligibilityResult> {
  const checkedAt = new Date();
  const blockingReasons: string[] = [];
  const warnings: string[] = [];
  const pilot = await db.pilot.findUnique({ where: { id: pilotId }, include: { authUser: true } });
  if (!pilot) return { allowed: false, blockingReasons: ["Pilot does not exist."], warnings, checkedAt };
  if (pilot.status !== "active") blockingReasons.push(`Pilot status ${pilot.status} does not permit booking.`);
  if (!pilot.authUser || pilot.authUser.status !== "ACTIVE") blockingReasons.push("HispaFly account is not active.");
  if (!pilot.authUser?.emailVerifiedAt) blockingReasons.push("Email verification is required.");
  if (!pilot.rankName && !pilot.rank) warnings.push("No rank qualification is recorded; type-rating enforcement is not yet available.");

  const buffer = TURNAROUND_BUFFER_MINUTES * 60_000;
  const conflict = await db.pilotBooking.findFirst({
    where: {
      pilotId,
      status: { in: ACTIVE_BOOKING_STATUSES },
      flightId: { not: flight.id },
      selectedDepartureAt: { lt: new Date(flight.scheduledArrival.getTime() + buffer) },
      OR: [
        { estimatedArrivalAt: { gt: new Date(flight.scheduledDeparture.getTime() - buffer) } },
        { estimatedArrivalAt: null },
      ],
    },
    select: { id: true },
  });
  if (conflict) blockingReasons.push("Pilot has an overlapping booking or turnaround conflict.");
  const activeDispatch = await db.flightDispatch.findFirst({
    where: { pilotId, status: { in: ["DISPATCHING", "DISPATCHED", "RELEASED"] } },
    select: { id: true },
  });
  if (activeDispatch) blockingReasons.push("Pilot already has an active dispatch.");
  return { allowed: blockingReasons.length === 0, blockingReasons, warnings, checkedAt };
}

export async function listBookableFlights(input: {
  pilotId: string;
  from?: Date;
  to?: Date;
  departureAirportId?: string;
  arrivalAirportId?: string;
  flightNumber?: string;
  fleetId?: string;
  page?: number;
}) {
  const now = new Date();
  const page = Math.max(1, input.page || 1);
  const pageSize = 30;
  const where: Prisma.FlightWhereInput = {
    dataOrigin: { in: [AocDataOrigin.HISPAFLY_NATIVE, AocDataOrigin.MANUAL, AocDataOrigin.IMPORTED] },
    status: { in: BOOKABLE_FLIGHT_STATUSES },
    scheduledDeparture: { gt: now, ...(input.from ? { gte: input.from } : {}), ...(input.to ? { lte: input.to } : {}) },
    AND: [
      { OR: [{ bookingOpenAt: null }, { bookingOpenAt: { lte: now } }] },
      { OR: [{ bookingCloseAt: null }, { bookingCloseAt: { gt: now } }] },
    ],
    departureAirportId: input.departureAirportId || undefined,
    arrivalAirportId: input.arrivalAirportId || undefined,
    flightNumber: input.flightNumber ? { contains: input.flightNumber, mode: "insensitive" } : undefined,
    fleetId: input.fleetId || undefined,
    bookings: { none: { pilotId: input.pilotId, status: { in: ACTIVE_BOOKING_STATUSES } } },
  };
  const [rows, total] = await Promise.all([
    prisma.flight.findMany({
      where,
      include: { route: true, fleet: true, assignedAircraft: { include: { currentAirport: true, conditionSnapshot: true } } },
      orderBy: { scheduledDeparture: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.flight.count({ where }),
  ]);
  return { rows, total, page, pageSize };
}

export async function claimScheduledFlight(input: {
  pilotId: string;
  flightId: string;
  aircraftId?: string | null;
  idempotencyKey: string;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`scheduled-flight-book:${input.flightId}`}))`;
    const idempotent = await tx.pilotBooking.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (idempotent) {
      if (idempotent.pilotId === input.pilotId && idempotent.flightId === input.flightId) return idempotent;
      throw new Error("This booking request key is already in use.");
    }
    const priorPilotBooking = await tx.pilotBooking.findUnique({ where: { pilotId_flightId: { pilotId: input.pilotId, flightId: input.flightId } } });
    if (priorPilotBooking && ACTIVE_BOOKING_STATUSES.includes(priorPilotBooking.status)) return priorPilotBooking;

    const flight = await tx.flight.findUnique({
      where: { id: input.flightId },
      include: { route: true, assignedAircraft: { include: { nativeFleet: true, conditionSnapshot: true, locationSnapshot: true } } },
    });
    if (!flight) throw new Error("Flight does not exist.");
    if (flight.operatingType !== "SCHEDULED" || !flight.scheduleId) throw new Error("Only a published scheduled Flight can be claimed here.");
    assertNativeOrigin("Flight booking", flight.dataOrigin);
    assertNativeOrigin("Flight booking route", flight.route.dataOrigin);
    assertNativeIds("Flight booking", { flightId: flight.id, routeId: flight.routeId, departureAirportId: flight.departureAirportId, arrivalAirportId: flight.arrivalAirportId });
    const now = new Date();
    if (!BOOKABLE_FLIGHT_STATUSES.includes(flight.status)) throw new Error("Flight is not open for booking.");
    if (flight.scheduledDeparture <= now) throw new Error("Flight departure has passed.");
    if (flight.bookingOpenAt && flight.bookingOpenAt > now) throw new Error("Booking window has not opened.");
    if (flight.bookingCloseAt && flight.bookingCloseAt <= now) throw new Error("Booking window has closed.");

    const activeBooking = await tx.pilotBooking.findFirst({ where: { flightId: flight.id, status: { in: ACTIVE_BOOKING_STATUSES } } });
    if (activeBooking) {
      if (activeBooking.pilotId === input.pilotId) return activeBooking;
      throw new Error("Este vuelo acaba de ser reservado por otra tripulación.");
    }
    const pilot = await tx.pilot.findUnique({ where: { id: input.pilotId }, select: { currentAirportId: true } });
    if (!pilot?.currentAirportId || pilot.currentAirportId !== flight.departureAirportId) throw new Error("Tu posición actual no coincide con el aeropuerto de salida de este vuelo.");
    const eligibility = await checkPilotEligibility(input.pilotId, flight, tx);
    if (!eligibility.allowed) throw new Error(eligibility.blockingReasons.join(" "));
    const aircraftId = flight.assignedAircraftId ?? input.aircraftId ?? null;
    if (flight.assignedAircraftId && input.aircraftId && input.aircraftId !== flight.assignedAircraftId) {
      throw new Error("This flight has a fixed aircraft assignment.");
    }
    if (aircraftId) {
      const aircraft = await tx.aircraft.findUnique({ where: { id: aircraftId }, include: { nativeFleet: true, conditionSnapshot: true, locationSnapshot: true } });
      if (!aircraft) throw new Error("Aircraft does not exist.");
      assertNativeOrigin("Flight booking aircraft", aircraft.dataOrigin);
      if (aircraft.operationMode === "FREE") throw new Error("This aircraft is reserved for free flights and cannot operate PROGRAMACION.");
      const aircraftState = resolveAircraftState(aircraft);
      if (!aircraftState.available) throw new Error("Aircraft is not operationally available.");
      if (aircraft.conditionSnapshot && ["AOG", "IN_MAINTENANCE"].includes(aircraft.conditionSnapshot.operationalStatus)) throw new Error("Aircraft maintenance status blocks booking.");
      if (flight.fleetId && aircraft.nativeFleetId !== flight.fleetId) throw new Error("Aircraft does not belong to the required fleet.");
      if (aircraftState.currentAirportId && flight.departureAirportId && aircraftState.currentAirportId !== flight.departureAirportId) throw new Error("Aircraft is not at the departure airport.");
      const [conflict, dispatchConflict, flightConflict] = await Promise.all([tx.pilotBooking.findFirst({
        where: {
          aircraftId,
          status: { in: ACTIVE_BOOKING_STATUSES },
          selectedDepartureAt: { lt: flight.scheduledArrival },
          OR: [{ estimatedArrivalAt: { gt: flight.scheduledDeparture } }, { estimatedArrivalAt: null }],
        },
      }), tx.flightDispatch.findFirst({ where: { aircraftId, status: { in: ["DISPATCHING", "DISPATCHED", "RELEASED"] }, selectedDepartureAt: { lt: flight.scheduledArrival }, OR: [{ estimatedArrivalAt: { gt: flight.scheduledDeparture } }, { estimatedArrivalAt: null }] } }), tx.flight.findFirst({ where: { id: { not: flight.id }, assignedAircraftId: aircraftId, status: { notIn: ["COMPLETED", "CANCELLED", "EXPIRED"] }, scheduledDeparture: { lt: flight.scheduledArrival }, scheduledArrival: { gt: flight.scheduledDeparture } } })]);
      if (conflict || dispatchConflict || flightConflict) throw new Error("Aircraft is already reserved during this flight window.");
    }
    const selectedAircraft = aircraftId ? await tx.aircraft.findUnique({ where: { id: aircraftId } }) : null;
    const bookingData = {
        dataOrigin: AocDataOrigin.HISPAFLY_NATIVE,
        pilotId: input.pilotId,
        flightId: flight.id,
        routeId: flight.routeId,
        fleetId: flight.fleetId,
        aircraftId,
        departureIcao: flight.departureIcao,
        arrivalIcao: flight.arrivalIcao,
        flightNumber: flight.flightNumber,
        callsign: flight.callsign,
        aircraftType: selectedAircraft?.aircraftType ?? null,
        aircraftRegistration: selectedAircraft?.registration ?? null,
        selectedDepartureAt: flight.scheduledDeparture,
        estimatedArrivalAt: flight.scheduledArrival,
        estimatedDurationMinutes: flight.scheduledDurationMinutes,
        status: PilotBookingStatus.CONFIRMED,
        expiresAt: flight.scheduledDeparture,
        idempotencyKey: input.idempotencyKey,
        cancelledAt: null,
        cancellationReason: null,
      } satisfies Prisma.PilotBookingUncheckedCreateInput;
    const booking = priorPilotBooking
      ? await tx.pilotBooking.update({ where: { id: priorPilotBooking.id }, data: bookingData })
      : await tx.pilotBooking.create({ data: bookingData });
    await tx.flight.update({ where: { id: flight.id }, data: { status: NativeFlightStatus.BOOKED } });
    await tx.aocAuditLog.create({ data: { action: "SCHEDULED_FLIGHT_BOOKED", entityType: "PilotBooking", entityId: booking.id, message: "Pilot claimed a published scheduled Flight.", metadata: { flightId: flight.id, scheduleId: flight.scheduleId, pilotId: input.pilotId, routeId: flight.routeId, aircraftId, scheduledDeparture: flight.scheduledDeparture.toISOString(), bookingId: booking.id } } });
    return booking;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

// Backward-compatible name for the existing pilot action; scheduled claims use the guarded operation above.
export const createNativeBooking = claimScheduledFlight;

export async function cancelNativeBooking(bookingId: string, pilotId: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pilot-booking-cancel:${bookingId}`}))`;
    const booking = await tx.pilotBooking.findFirst({ where: { id: bookingId, pilotId }, include: { dispatch: { include: { ofpBriefing: true } }, flight: true } });
    if (!booking) throw new Error("Booking does not exist.");
    if (booking.dataOrigin === AocDataOrigin.VAMSYS_LEGACY) throw new Error("Legacy bookings are read-only.");
    const cancellable = new Set<PilotBookingStatus>([PilotBookingStatus.PENDING, PilotBookingStatus.CONFIRMED, PilotBookingStatus.BOOKED, PilotBookingStatus.DISPATCH_PENDING, PilotBookingStatus.DISPATCHED]);
    if (!cancellable.has(booking.status)) throw new Error("Booking can no longer be cancelled.");
    const now = new Date();
    if (booking.flight && booking.flight.scheduledDeparture <= now) throw new Error("A departed Flight cannot be cancelled here.");
    if (booking.dispatch && new Set<FlightDispatchStatus>([FlightDispatchStatus.FLOWN, FlightDispatchStatus.REWARDED]).has(booking.dispatch.status)) throw new Error("An in-progress or completed Dispatch cannot be cancelled.");
    if (booking.dispatch) {
      const released = booking.dispatch.status === FlightDispatchStatus.RELEASED;
      await tx.flightDispatch.update({ where: { id: booking.dispatch.id }, data: released ? { status: FlightDispatchStatus.VOIDED, voidedAt: now, voidReason: reason } : { status: FlightDispatchStatus.CANCELLED, cancelledAt: now, errorMessage: reason } });
      if (booking.dispatch.ofpBriefing) await tx.dispatchRelease.updateMany({ where: { ofpBriefingId: booking.dispatch.ofpBriefing.id }, data: { status: released ? "VOIDED" : "CANCELLED" } });
      if (booking.dispatch.flightOfferId) await tx.flightOffer.updateMany({ where: { id: booking.dispatch.flightOfferId }, data: { status: "CANCELLED" } });
      if (booking.dispatch.aircraftId) {
        await tx.aircraft.updateMany({ where: { id: booking.dispatch.aircraftId, operationalStatus: { in: ["RESERVED", "DISPATCHED"] } }, data: { operationalStatus: "AVAILABLE" } });
        await tx.aircraftLocationSnapshot.updateMany({ where: { aircraftId: booking.dispatch.aircraftId, reservedByDispatchId: booking.dispatch.id }, data: { status: "AVAILABLE", reservedByDispatchId: null, lastReportAt: now } });
      }
    }
    const updated = await tx.pilotBooking.update({ where: { id: booking.id }, data: { status: PilotBookingStatus.CANCELLED, cancelledAt: now, cancellationReason: reason } });
    const terminal = new Set<NativeFlightStatus>([NativeFlightStatus.CANCELLED, NativeFlightStatus.COMPLETED]);
    if (booking.flight?.scheduleId && !terminal.has(booking.flight.status)) {
      const another = await tx.pilotBooking.findFirst({ where: { flightId: booking.flight.id, id: { not: booking.id }, status: { in: ACTIVE_BOOKING_STATUSES } } });
      if (!another) {
        const status = booking.flight.bookingOpenAt && booking.flight.bookingOpenAt > now ? NativeFlightStatus.SCHEDULED : booking.flight.bookingCloseAt && booking.flight.bookingCloseAt <= now ? NativeFlightStatus.EXPIRED : NativeFlightStatus.OPEN_FOR_BOOKING;
        await tx.flight.update({ where: { id: booking.flight.id }, data: { status } });
      }
      await tx.aocAuditLog.create({ data: { action: "SCHEDULED_FLIGHT_BOOKING_CANCELLED", entityType: "PilotBooking", entityId: booking.id, message: "Pilot cancelled a scheduled Flight booking.", metadata: { pilotId, flightId: booking.flight.id, reason } } });
    } else {
      if (booking.flight && !terminal.has(booking.flight.status)) await tx.flight.update({ where: { id: booking.flight.id }, data: { status: NativeFlightStatus.CANCELLED } });
      await tx.aocAuditLog.create({ data: { action: "PILOT_BOOKING_CANCELLED", entityType: "PilotBooking", entityId: booking.id, message: "Pilot cancelled a native booking.", metadata: { pilotId, reason } } });
    }
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function expireNativeBookings(limit = 100) {
  const candidates = await prisma.pilotBooking.findMany({
    where: { dataOrigin: { not: AocDataOrigin.VAMSYS_LEGACY }, status: { in: [PilotBookingStatus.PENDING, PilotBookingStatus.CONFIRMED, PilotBookingStatus.BOOKED] }, selectedDepartureAt: { lt: new Date() }, dispatch: null },
    take: limit,
    select: { id: true },
  });
  if (!candidates.length) return { expired: 0 };
  const result = await prisma.pilotBooking.updateMany({ where: { id: { in: candidates.map(({ id }) => id) }, status: { in: [PilotBookingStatus.PENDING, PilotBookingStatus.CONFIRMED, PilotBookingStatus.BOOKED] } }, data: { status: PilotBookingStatus.EXPIRED } });
  await writeAuditLogSafely({ action: "PILOT_BOOKINGS_EXPIRED", entityType: "PilotBooking", message: `Expired ${result.count} native bookings.`, metadata: { bookingIds: candidates.map(({ id }) => id) } });
  return { expired: result.count };
}

export const findBookingById = (id: string) => prisma.pilotBooking.findUnique({
  where: { id },
  include: { pilot: true, flight: true, route: true, fleet: true, aircraft: true, dispatch: true, matchedPirep: true },
});
