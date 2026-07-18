import { createHash } from "node:crypto";
import { AocDataOrigin, NativeFlightStatus, PilotBookingStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertNativeIds, assertNativeOrigin } from "@/lib/native-cutover/write-gate";
import { checkPilotEligibility } from "./booking";
import { fleetIsAuthorized, validateSelfDispatchWindow } from "./self-dispatch-rules";

const ACTIVE_BOOKING_STATUSES: PilotBookingStatus[] = ["PENDING", "CONFIRMED", "DISPATCH_PENDING", "DISPATCHED", "IN_PROGRESS", "BOOKED"];
const ACTIVE_FLIGHT_STATUSES: NativeFlightStatus[] = ["SCHEDULED", "OPEN", "OPEN_FOR_BOOKING", "BOOKED", "DISPATCH_PENDING", "DISPATCHED", "BOARDING", "IN_PROGRESS", "DEPARTED", "AIRBORNE", "LANDED"];
const localParts = (value: Date, timezone: string) => Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(value).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));

export async function createNativeSelfDispatch(input: { pilotId: string; routeId: string; aircraftId: string; departureAt: Date; idempotencyKey: string; network: string; altitude?: number | null; loadFactorPercent: number; baggageKgPerPassenger: number; freightKg: number; userRoute?: string | null }) {
  const windowError = validateSelfDispatchWindow(input.departureAt);
  if (windowError) throw new Error(windowError);
  if (!input.idempotencyKey) throw new Error("Self-dispatch request identity is missing.");
  if (!["vatsim", "ivao", "poscon", "offline"].includes(input.network)) throw new Error("Select a supported flight network.");
  if ((input.userRoute?.length ?? 0) > 2_000) throw new Error("Operational route is too long.");
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`self-dispatch:${input.aircraftId}`}))`;
    const duplicate = await tx.pilotBooking.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (duplicate) return duplicate;
    const route = await tx.route.findUnique({ where: { id: input.routeId }, include: { departureAirport: true, arrivalAirport: true, fleetAssignments: true, fleetCompatibility: true } });
    if (!route || !route.active || route.operationalStatus !== "ACTIVE" || route.archivedAt) throw new Error("The selected route is not operationally available.");
    assertNativeOrigin("Self-dispatch route", route.dataOrigin);
    assertNativeIds("Self-dispatch route", { routeId: route.id, departureAirportId: route.departureAirportId, arrivalAirportId: route.arrivalAirportId });
    if (!route.departureAirport || !route.arrivalAirport) throw new Error("The route airport identity is incomplete.");
    const duration = route.scheduledDurationMinutes;
    if (!duration || duration <= 0) throw new Error("The route has no valid scheduled duration.");
    const arrivalAt = new Date(input.departureAt.getTime() + duration * 60_000);
    const eligibility = await checkPilotEligibility(input.pilotId, { id: `self:${input.idempotencyKey}`, scheduledDeparture: input.departureAt, scheduledArrival: arrivalAt }, tx);
    if (!eligibility.allowed) throw new Error(eligibility.blockingReasons.join(" "));
    const aircraft = await tx.aircraft.findUnique({ where: { id: input.aircraftId }, include: { nativeFleet: true, conditionSnapshot: true } });
    if (!aircraft) throw new Error("The selected aircraft does not exist.");
    assertNativeOrigin("Self-dispatch aircraft", aircraft.dataOrigin);
    if (aircraft.operationalStatus !== "AVAILABLE") throw new Error("The selected aircraft is not available.");
    if (!aircraft.nativeFleetId || aircraft.nativeFleet?.operationalStatus !== "ACTIVE") throw new Error("The selected aircraft Fleet is not active.");
    if (!aircraft.seatCapacity || aircraft.seatCapacity <= 0) throw new Error("Aircraft seat capacity must be configured before self-dispatch.");
    if (aircraft.currentAirportId !== route.departureAirportId) throw new Error("The selected aircraft is not at the route departure airport.");
    if (aircraft.conditionSnapshot && (["AOG", "IN_MAINTENANCE"].includes(aircraft.conditionSnapshot.operationalStatus) || ["REQUIRED", "IN_PROGRESS", "WAITING_MAINTENANCE"].includes(aircraft.conditionSnapshot.maintenanceStatus))) throw new Error("Aircraft maintenance status blocks self-dispatch.");
    const assignedFleetIds = route.fleetAssignments.map((row) => row.fleetId);
    if (!fleetIsAuthorized(assignedFleetIds, aircraft.nativeFleetId)) throw new Error("The aircraft Fleet is not authorized for this route.");
    if (route.fleetCompatibility.some((row) => row.fleetId === aircraft.nativeFleetId && row.policy === "FORBIDDEN")) throw new Error("The aircraft Fleet is forbidden on this route.");
    const [flightConflict, bookingConflict, dispatchConflict] = await Promise.all([
      tx.flight.findFirst({ where: { assignedAircraftId: aircraft.id, status: { in: ACTIVE_FLIGHT_STATUSES }, scheduledDeparture: { lt: arrivalAt }, scheduledArrival: { gt: input.departureAt } }, select: { id: true } }),
      tx.pilotBooking.findFirst({ where: { aircraftId: aircraft.id, status: { in: ACTIVE_BOOKING_STATUSES }, selectedDepartureAt: { lt: arrivalAt }, OR: [{ estimatedArrivalAt: { gt: input.departureAt } }, { estimatedArrivalAt: null }] }, select: { id: true } }),
      tx.flightDispatch.findFirst({ where: { aircraftId: aircraft.id, status: { in: ["DISPATCHING", "DISPATCHED", "RELEASED"] }, selectedDepartureAt: { lt: arrivalAt }, OR: [{ estimatedArrivalAt: { gt: input.departureAt } }, { estimatedArrivalAt: null }] }, select: { id: true } }),
    ]);
    if (flightConflict || bookingConflict || dispatchConflict) throw new Error("The selected aircraft already has an overlapping operation.");
    const departureTimezone = route.departureAirport.timezone || "UTC", arrivalTimezone = route.arrivalAirport.timezone || "UTC";
    const dep = localParts(input.departureAt, departureTimezone), arr = localParts(arrivalAt, arrivalTimezone);
    const operatingDate = new Date(`${dep.year}-${dep.month}-${dep.day}T00:00:00.000Z`);
    const flightNumber = route.flightNumber || route.routeCode || `HF${input.idempotencyKey.slice(0, 4).toUpperCase()}`;
    const callsign = route.callsign || flightNumber.replace(/[^A-Z0-9]/gi, "").slice(0, 7);
    const generationKey = createHash("sha256").update(`pilot-self-dispatch:${input.idempotencyKey}`).digest("hex");
    const flight = await tx.flight.create({ data: {
      dataOrigin: AocDataOrigin.HISPAFLY_NATIVE, routeId: route.id, departureAirportId: route.departureAirportId, arrivalAirportId: route.arrivalAirportId,
      operatingDate, scheduledDeparture: input.departureAt, scheduledArrival: arrivalAt, scheduledDurationMinutes: duration,
      flightNumber, callsign, departureIcao: route.departureAirport.icao, arrivalIcao: route.arrivalAirport.icao,
      departureTimezone, arrivalTimezone, departureLocalTime: `${dep.hour}:${dep.minute}`, arrivalLocalTime: `${arr.hour}:${arr.minute}`,
      fleetId: aircraft.nativeFleetId, assignedAircraftId: aircraft.id, status: NativeFlightStatus.BOOKED, bookingOpenAt: new Date(), bookingCloseAt: input.departureAt,
      generationKey, operatingType: "PILOT_SELF_DISPATCH", notes: "Pilot-created HispaFly Native self-dispatch operation.",
    } });
    if (!Number.isFinite(input.loadFactorPercent) || input.loadFactorPercent < 25 || input.loadFactorPercent > 100) throw new Error("Load factor must be between 25% and 100%.");
    if (!Number.isFinite(input.baggageKgPerPassenger) || input.baggageKgPerPassenger < 0 || input.baggageKgPerPassenger > 100) throw new Error("Baggage per passenger is invalid.");
    if (!Number.isInteger(input.freightKg) || input.freightKg < 0) throw new Error("Freight must be a non-negative whole number of kilograms.");
    const passengers = Math.max(1, Math.min(aircraft.seatCapacity, Math.round(aircraft.seatCapacity * input.loadFactorPercent / 100)));
    const luggageKg = Math.round(passengers * input.baggageKgPerPassenger);
    const cargoKg = luggageKg + input.freightKg;
    const booking = await tx.pilotBooking.create({ data: {
      dataOrigin: AocDataOrigin.HISPAFLY_NATIVE, pilotId: input.pilotId, flightId: flight.id, routeId: route.id, fleetId: aircraft.nativeFleetId, aircraftId: aircraft.id,
      departureIcao: flight.departureIcao, arrivalIcao: flight.arrivalIcao, flightNumber, callsign, aircraftType: aircraft.aircraftType, aircraftRegistration: aircraft.registration,
      selectedDepartureAt: input.departureAt, estimatedArrivalAt: arrivalAt, estimatedDurationMinutes: duration, status: PilotBookingStatus.CONFIRMED,
      network: input.network || "vatsim", altitude: input.altitude || route.cruiseAltitude, passengers, cargoKg, loadFactorPercent: input.loadFactorPercent,
      baggageKgPerPassenger: input.baggageKgPerPassenger, luggageKg, freightKg: input.freightKg, userRoute: input.userRoute || route.route,
      expiresAt: input.departureAt, idempotencyKey: input.idempotencyKey, operationalNotes: "Created through HispaFly Native pilot self-dispatch.",
    } });
    await tx.aocAuditLog.create({ data: { action: "PILOT_NATIVE_SELF_DISPATCH_CREATED", entityType: "PilotBooking", entityId: booking.id, message: `Pilot created self-dispatch ${flightNumber} ${flight.departureIcao}-${flight.arrivalIcao}.`, metadata: { pilotId: input.pilotId, flightId: flight.id, routeId: route.id, aircraftId: aircraft.id, departureAt: input.departureAt.toISOString() } as Prisma.InputJsonValue } });
    return booking;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
