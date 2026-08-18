import { AocDataOrigin, NativeFlightStatus, PilotBookingStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { distanceKm } from "@/lib/pilot/position-rules";
import { companyRepositionPilot } from "@/lib/pilot/company-reposition";
import { checkPilotEligibility } from "./booking";
import { readAircraftDelivery } from "./aircraft-delivery";

export const AIRCRAFT_DELIVERY_OPERATING_TYPE = "AIRCRAFT_DELIVERY";
const ACTIVE_BOOKING_STATUSES: PilotBookingStatus[] = [
  PilotBookingStatus.PENDING,
  PilotBookingStatus.CONFIRMED,
  PilotBookingStatus.DISPATCH_PENDING,
  PilotBookingStatus.DISPATCHED,
  PilotBookingStatus.IN_PROGRESS,
  PilotBookingStatus.BOOKED,
];

const localParts = (value: Date, timezone: string) => {
  const format = (zone: string) => Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(value)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  try { return format(timezone || "UTC"); } catch { return format("UTC"); }
};

const deliveryFlightIdentity = (aircraftId: string) => {
  const hash = [...aircraftId].reduce((sum, char, index) => sum + char.charCodeAt(0) * (index + 1), 0);
  const number = `9${String(hash % 1000).padStart(3, "0")}`;
  return { flightNumber: `HF${number}`, callsign: `HPF${number}` };
};

export function deliveryBlockMinutes(input: {
  origin: { latitude: number | null; longitude: number | null };
  destination: { latitude: number | null; longitude: number | null };
  cruiseSpeedKts?: number | null;
}) {
  const km = distanceKm(input.origin, input.destination);
  if (km == null) return 120;
  const distanceNm = km / 1.852;
  const cruiseSpeed = input.cruiseSpeedKts && input.cruiseSpeedKts > 0 ? input.cruiseSpeedKts : 400;
  return Math.max(45, Math.ceil((distanceNm / cruiseSpeed) * 60 + 35));
}

export async function listPilotDeliveryTasks(pilotId: string) {
  const [pilot, aircraftRows] = await Promise.all([
    prisma.pilot.findUnique({ where: { id: pilotId }, include: { currentAirport: true } }),
    prisma.aircraft.findMany({
      where: { archivedAt: null, dataOrigin: { not: AocDataOrigin.VAMSYS_LEGACY } },
      include: {
        nativeFleet: true,
        currentAirport: true,
        locationSnapshot: true,
        nativeBookings: {
          where: { status: { in: ACTIVE_BOOKING_STATUSES } },
          include: { pilot: { select: { id: true, displayName: true } }, flight: true },
          orderBy: { bookedAt: "desc" },
        },
      },
      orderBy: { registration: "asc" },
    }),
  ]);

  if (!pilot) throw new Error("Pilot not found.");
  return aircraftRows.flatMap((aircraft) => {
    const delivery = readAircraftDelivery(aircraft.rawData);
    if (!delivery?.active) return [];
    const currentIcao = (aircraft.currentAirport?.icao ?? aircraft.locationSnapshot?.currentAirportIcao ?? delivery.originIcao).toUpperCase();
    const activeBooking = aircraft.nativeBookings.find((booking) => booking.flight?.operatingType === AIRCRAFT_DELIVERY_OPERATING_TYPE) ?? null;
    const state = currentIcao === delivery.destinationIcao && !activeBooking
      ? "ARRIVED"
      : activeBooking?.pilotId === pilotId
        ? "MY_BOOKING"
        : activeBooking
          ? "RESERVED"
          : currentIcao === delivery.originIcao
            ? "AVAILABLE"
            : "POSITION_MISMATCH";
    return [{
      aircraftId: aircraft.id,
      registration: aircraft.registration ?? "—",
      aircraftType: aircraft.aircraftType ?? aircraft.nativeFleet?.type ?? "—",
      fleetCode: aircraft.nativeFleet?.code ?? null,
      delivery,
      deliveryDate: aircraft.deliveryDate,
      currentIcao,
      state,
      bookingId: activeBooking?.id ?? null,
      bookingPilotName: activeBooking?.pilot.displayName ?? null,
      pilotCurrentIcao: pilot.currentAirport?.icao ?? null,
    }];
  });
}

export async function acceptAircraftDelivery(input: {
  pilotId: string;
  aircraftId: string;
  departureAt: Date;
}) {
  if (!Number.isFinite(input.departureAt.getTime())) throw new Error("Select a valid delivery departure time.");
  if (input.departureAt.getTime() < Date.now() + 5 * 60_000) throw new Error("Delivery departure must be at least five minutes in the future.");

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`aircraft-delivery:${input.aircraftId}`}))`;

    const aircraft = await tx.aircraft.findUnique({
      where: { id: input.aircraftId },
      include: { nativeFleet: true, currentAirport: true, locationSnapshot: true, conditionSnapshot: true },
    });
    if (!aircraft || aircraft.archivedAt) throw new Error("Delivery aircraft is unavailable.");
    const delivery = readAircraftDelivery(aircraft.rawData);
    if (!delivery?.active) throw new Error("This aircraft is no longer in DELIVERY lifecycle.");
    const fleet = aircraft.nativeFleet;
    if (!aircraft.nativeFleetId || !fleet || fleet.operationalStatus !== "ACTIVE") throw new Error("Delivery aircraft Fleet is not active.");
    if (aircraft.conditionSnapshot && (["AOG", "IN_MAINTENANCE"].includes(aircraft.conditionSnapshot.operationalStatus) || ["REQUIRED", "IN_PROGRESS", "WAITING_MAINTENANCE"].includes(aircraft.conditionSnapshot.maintenanceStatus))) {
      throw new Error("Aircraft maintenance status blocks delivery acceptance.");
    }

    const [origin, destination] = await Promise.all([
      tx.airport.findUnique({ where: { icao: delivery.originIcao } }),
      tx.airport.findUnique({ where: { icao: delivery.destinationIcao } }),
    ]);
    if (!origin || origin.status !== "ACTIVE" || origin.archivedAt) throw new Error(`${delivery.originIcao} must exist as an active AOC Airport before a crew can accept this delivery.`);
    if (!destination || destination.status !== "ACTIVE" || destination.archivedAt) throw new Error(`${delivery.destinationIcao} is not an active AOC Airport.`);

    const currentIcao = (aircraft.currentAirport?.icao ?? aircraft.locationSnapshot?.currentAirportIcao ?? delivery.originIcao).toUpperCase();
    if (currentIcao === delivery.destinationIcao) throw new Error("Aircraft has already arrived at the delivery destination and is awaiting Staff entry into service.");
    if (currentIcao !== delivery.originIcao) throw new Error(`Aircraft is currently at ${currentIcao}; delivery can only be accepted while it is at ${delivery.originIcao}.`);

    const activeBooking = await tx.pilotBooking.findFirst({
      where: { aircraftId: aircraft.id, status: { in: ACTIVE_BOOKING_STATUSES }, flight: { operatingType: AIRCRAFT_DELIVERY_OPERATING_TYPE } },
      include: { flight: true },
    });
    if (activeBooking) {
      if (activeBooking.pilotId === input.pilotId) return { booking: activeBooking, repositioned: false, alreadyAccepted: true };
      throw new Error("This aircraft delivery has just been accepted by another crew.");
    }

    const [otherBooking, activeDispatch, activeFlight] = await Promise.all([
      tx.pilotBooking.findFirst({ where: { aircraftId: aircraft.id, status: { in: ACTIVE_BOOKING_STATUSES } }, select: { id: true } }),
      tx.flightDispatch.findFirst({ where: { aircraftId: aircraft.id, status: { in: ["DISPATCHING", "DISPATCHED", "RELEASED"] } }, select: { id: true } }),
      tx.flight.findFirst({ where: { assignedAircraftId: aircraft.id, status: { notIn: ["COMPLETED", "CANCELLED", "EXPIRED"] } }, select: { id: true } }),
    ]);
    if (otherBooking || activeDispatch || activeFlight) throw new Error("Aircraft already has an active operation and cannot be accepted for delivery.");

    const durationMinutes = deliveryBlockMinutes({ origin, destination, cruiseSpeedKts: fleet.cruiseSpeedKts });
    const scheduledArrival = new Date(input.departureAt.getTime() + durationMinutes * 60_000);
    const eligibility = await checkPilotEligibility(input.pilotId, { id: `delivery:${aircraft.id}`, scheduledDeparture: input.departureAt, scheduledArrival }, tx);
    if (!eligibility.allowed) throw new Error(eligibility.blockingReasons.join(" "));

    const reposition = await companyRepositionPilot(tx, {
      pilotId: input.pilotId,
      arrivalAirportId: origin.id,
      reason: "AIRCRAFT_DELIVERY",
      referenceId: aircraft.id,
    });

    await tx.aircraft.update({
      where: { id: aircraft.id },
      data: { operationalStatus: "FERRY_ONLY", status: "FERRY_ONLY", operationMode: "SCHEDULED", currentAirportId: origin.id },
    });
    await tx.aircraftLocationSnapshot.upsert({
      where: { aircraftId: aircraft.id },
      create: {
        aircraftId: aircraft.id,
        vamsysAircraftId: aircraft.vamsysAircraftId ?? `native:${aircraft.id}`,
        registration: aircraft.registration,
        aircraftType: aircraft.aircraftType,
        currentAirportId: origin.id,
        currentAirportIcao: origin.icao,
        currentAirportIata: origin.iata,
        lastLatitude: origin.latitude,
        lastLongitude: origin.longitude,
        status: "AVAILABLE",
        source: "MANUAL",
        notes: `Aircraft delivery accepted; ${origin.icao} → ${destination.icao}`,
        lastReportAt: new Date(),
      },
      update: {
        currentAirportId: origin.id,
        currentAirportIcao: origin.icao,
        currentAirportIata: origin.iata,
        lastLatitude: origin.latitude,
        lastLongitude: origin.longitude,
        status: "AVAILABLE",
        source: "MANUAL",
        reservedByDispatchId: null,
        notes: `Aircraft delivery accepted; ${origin.icao} → ${destination.icao}`,
        lastReportAt: new Date(),
      },
    });

    const { flightNumber, callsign } = deliveryFlightIdentity(aircraft.id);
    const departureTimezone = origin.timezone || "UTC";
    const arrivalTimezone = destination.timezone || "UTC";
    const dep = localParts(input.departureAt, departureTimezone);
    const arr = localParts(scheduledArrival, arrivalTimezone);
    const operatingDate = new Date(`${dep.year}-${dep.month}-${dep.day}T00:00:00.000Z`);
    const km = distanceKm(origin, destination);
    const distanceNm = km == null ? null : Math.round(km / 1.852);

    const route = await tx.route.create({
      data: {
        dataOrigin: AocDataOrigin.HISPAFLY_NATIVE,
        flightNumber,
        callsign,
        name: `Aircraft delivery ${aircraft.registration ?? aircraft.aircraftType ?? aircraft.id}`,
        routeCode: `DELIVERY-${(aircraft.registration ?? aircraft.id).replace(/[^A-Z0-9]/gi, "")}`,
        departure: origin.icao,
        arrival: destination.icao,
        departureAirportId: origin.id,
        arrivalAirportId: destination.id,
        defaultFleetId: aircraft.nativeFleetId,
        scheduledDurationMinutes: durationMinutes,
        distanceNm,
        cruiseAltitude: fleet.defaultCruiseAltitudeFt,
        operationalStatus: "HIDDEN",
        syncStatus: "LOCAL_DRAFT",
        active: false,
        internalNotes: `System-generated AIRCRAFT_DELIVERY route for ${aircraft.registration ?? aircraft.id}. Not available for normal scheduling or self-dispatch.`,
      },
    });
    const flight = await tx.flight.create({
      data: {
        dataOrigin: AocDataOrigin.HISPAFLY_NATIVE,
        routeId: route.id,
        departureAirportId: origin.id,
        arrivalAirportId: destination.id,
        operatingDate,
        scheduledDeparture: input.departureAt,
        scheduledArrival,
        scheduledDurationMinutes: durationMinutes,
        flightNumber,
        callsign,
        departureIcao: origin.icao,
        arrivalIcao: destination.icao,
        departureTimezone,
        arrivalTimezone,
        departureLocalTime: `${dep.hour}:${dep.minute}`,
        arrivalLocalTime: `${arr.hour}:${arr.minute}`,
        fleetId: aircraft.nativeFleetId,
        assignedAircraftId: aircraft.id,
        status: NativeFlightStatus.BOOKED,
        bookingOpenAt: new Date(),
        bookingCloseAt: input.departureAt,
        operatingType: AIRCRAFT_DELIVERY_OPERATING_TYPE,
        notes: `HISPAFLY aircraft delivery operation. Company-sponsored crew reposition to ${origin.icao}: EUR 0.00.`,
      },
    });
    const booking = await tx.pilotBooking.create({
      data: {
        dataOrigin: AocDataOrigin.HISPAFLY_NATIVE,
        pilotId: input.pilotId,
        flightId: flight.id,
        routeId: route.id,
        fleetId: aircraft.nativeFleetId,
        aircraftId: aircraft.id,
        departureIcao: origin.icao,
        arrivalIcao: destination.icao,
        flightNumber,
        callsign,
        aircraftType: aircraft.aircraftType,
        aircraftRegistration: aircraft.registration,
        selectedDepartureAt: input.departureAt,
        estimatedArrivalAt: scheduledArrival,
        estimatedDurationMinutes: durationMinutes,
        passengers: 0,
        cargoKg: 0,
        status: PilotBookingStatus.CONFIRMED,
        expiresAt: input.departureAt,
        operationalNotes: `AIRCRAFT_DELIVERY. Crew company-repositioned to ${origin.icao}; Jumpseat cost EUR 0.00 and Pilot Wallet not debited.`,
      },
    });

    await tx.aocAuditLog.create({
      data: {
        action: "AIRCRAFT_DELIVERY_ACCEPTED",
        entityType: "PilotBooking",
        entityId: booking.id,
        message: `Pilot accepted delivery ${aircraft.registration ?? aircraft.id} ${origin.icao}-${destination.icao}.`,
        metadata: {
          pilotId: input.pilotId,
          aircraftId: aircraft.id,
          flightId: flight.id,
          routeId: route.id,
          originIcao: origin.icao,
          destinationIcao: destination.icao,
          selectedDepartureAt: input.departureAt.toISOString(),
          companyReposition: reposition.repositioned,
          jumpseatCostCents: 0,
          pilotWalletDebited: false,
        } as Prisma.InputJsonValue,
      },
    });
    return { booking, repositioned: reposition.repositioned, alreadyAccepted: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
