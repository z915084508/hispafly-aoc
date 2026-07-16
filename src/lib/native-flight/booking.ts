import { AocDataOrigin, NativeFlightStatus, PilotBookingStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLogSafely } from "@/lib/audit/log";

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
    where: { pilotId, status: { in: ["DISPATCHING", "DISPATCHED"] } },
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

export async function createNativeBooking(input: {
  pilotId: string;
  flightId: string;
  aircraftId?: string | null;
  idempotencyKey: string;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`booking:${input.flightId}`}))`;
    const existing = await tx.pilotBooking.findFirst({
      where: { OR: [{ idempotencyKey: input.idempotencyKey }, { pilotId: input.pilotId, flightId: input.flightId }] },
    });
    if (existing) return existing;

    const flight = await tx.flight.findUnique({
      where: { id: input.flightId },
      include: { route: true, assignedAircraft: { include: { nativeFleet: true, conditionSnapshot: true } } },
    });
    if (!flight) throw new Error("Flight does not exist.");
    const now = new Date();
    if (!BOOKABLE_FLIGHT_STATUSES.includes(flight.status)) throw new Error("Flight is not open for booking.");
    if (flight.scheduledDeparture <= now) throw new Error("Flight departure has passed.");
    if (flight.bookingOpenAt && flight.bookingOpenAt > now) throw new Error("Booking window has not opened.");
    if (flight.bookingCloseAt && flight.bookingCloseAt <= now) throw new Error("Booking window has closed.");

    const eligibility = await checkPilotEligibility(input.pilotId, flight, tx);
    if (!eligibility.allowed) throw new Error(eligibility.blockingReasons.join(" "));
    const aircraftId = flight.assignedAircraftId ?? input.aircraftId ?? null;
    if (flight.assignedAircraftId && input.aircraftId && input.aircraftId !== flight.assignedAircraftId) {
      throw new Error("This flight has a fixed aircraft assignment.");
    }
    if (aircraftId) {
      const aircraft = await tx.aircraft.findUnique({ where: { id: aircraftId }, include: { nativeFleet: true, conditionSnapshot: true } });
      if (!aircraft) throw new Error("Aircraft does not exist.");
      if (!["AVAILABLE", "FERRY_ONLY"].includes(aircraft.operationalStatus)) throw new Error("Aircraft is not operationally available.");
      if (aircraft.conditionSnapshot && ["AOG", "IN_MAINTENANCE"].includes(aircraft.conditionSnapshot.operationalStatus)) throw new Error("Aircraft maintenance status blocks booking.");
      if (flight.fleetId && aircraft.nativeFleetId !== flight.fleetId) throw new Error("Aircraft does not belong to the required fleet.");
      if (aircraft.currentAirportId && flight.departureAirportId && aircraft.currentAirportId !== flight.departureAirportId) throw new Error("Aircraft is not at the departure airport.");
      const conflict = await tx.pilotBooking.findFirst({
        where: {
          aircraftId,
          status: { in: ACTIVE_BOOKING_STATUSES },
          selectedDepartureAt: { lt: flight.scheduledArrival },
          OR: [{ estimatedArrivalAt: { gt: flight.scheduledDeparture } }, { estimatedArrivalAt: null }],
        },
      });
      if (conflict) throw new Error("Aircraft is already reserved during this flight window.");
    }
    return tx.pilotBooking.create({
      data: {
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
        aircraftType: flight.assignedAircraft?.aircraftType ?? null,
        aircraftRegistration: flight.assignedAircraft?.registration ?? null,
        selectedDepartureAt: flight.scheduledDeparture,
        estimatedArrivalAt: flight.scheduledArrival,
        estimatedDurationMinutes: flight.scheduledDurationMinutes,
        status: PilotBookingStatus.CONFIRMED,
        expiresAt: flight.scheduledDeparture,
        idempotencyKey: input.idempotencyKey,
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function cancelNativeBooking(bookingId: string, pilotId: string, reason: string) {
  const booking = await prisma.pilotBooking.findFirst({ where: { id: bookingId, pilotId }, include: { dispatch: true } });
  if (!booking) throw new Error("Booking does not exist.");
  if (booking.dataOrigin === AocDataOrigin.VAMSYS_LEGACY) throw new Error("Legacy bookings are read-only.");
  const cancellable = new Set<PilotBookingStatus>([PilotBookingStatus.PENDING, PilotBookingStatus.CONFIRMED, PilotBookingStatus.BOOKED]);
  const dispatchControlled = new Set<PilotBookingStatus>([PilotBookingStatus.DISPATCHED, PilotBookingStatus.IN_PROGRESS, PilotBookingStatus.COMPLETED]);
  if (!cancellable.has(booking.status)) throw new Error("Booking can no longer be cancelled directly.");
  if (booking.dispatch || dispatchControlled.has(booking.status)) throw new Error("Dispatch-controlled booking cannot be cancelled here.");
  const updated = await prisma.pilotBooking.update({ where: { id: booking.id }, data: { status: PilotBookingStatus.CANCELLED, cancelledAt: new Date(), cancellationReason: reason } });
  await writeAuditLogSafely({ action: "PILOT_BOOKING_CANCELLED", entityType: "PilotBooking", entityId: booking.id, message: "Pilot cancelled a native booking.", metadata: { pilotId, reason } });
  return updated;
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
