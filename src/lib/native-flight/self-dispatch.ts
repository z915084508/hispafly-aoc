import { createHash } from "node:crypto";
import { AocDataOrigin, NativeFlightStatus, PilotBookingStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertNativeIds, assertNativeOrigin } from "@/lib/native-cutover/write-gate";
import { checkPilotEligibility } from "./booking";
import { aircraftIsInDelivery } from "./aircraft-delivery";
import { fleetIsAuthorized, validateSelfDispatchWindow } from "./self-dispatch-rules";
import { resolveAircraftState } from "./aircraft-state";
import { allocateScheduleIdentities } from "@/lib/native-scheduling/flight-identity";
import type { AmnPayloadAllocation } from "@/lib/amn/payload";
import { HISPAFLY_PAYLOAD_POLICY, passengerBaggageWeight } from "@/lib/payload/policy";

const ACTIVE_BOOKING_STATUSES: PilotBookingStatus[] = ["PENDING", "CONFIRMED", "DISPATCH_PENDING", "DISPATCHED", "IN_PROGRESS", "BOOKED"];
const ACTIVE_FLIGHT_STATUSES: NativeFlightStatus[] = ["SCHEDULED", "OPEN", "OPEN_FOR_BOOKING", "BOOKED", "DISPATCH_PENDING", "DISPATCHED", "BOARDING", "IN_PROGRESS", "DEPARTED", "AIRBORNE", "LANDED"];
const localParts = (value: Date, timezone: string) => Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(value).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));

export async function createNativeSelfDispatch(input: { pilotId: string; routeId: string; aircraftId: string; departureAt: Date; idempotencyKey: string; network: string; altitude?: number | null; amnAllocation: AmnPayloadAllocation; userRoute?: string | null; acknowledgeLocationWarning?: boolean }) {
  const windowError = validateSelfDispatchWindow(input.departureAt);
  if (windowError) throw new Error(windowError);
  if (!input.idempotencyKey) throw new Error("Self-dispatch request identity is missing.");
  if (!["vatsim", "ivao", "poscon", "offline"].includes(input.network)) throw new Error("Select a supported flight network.");
  if ((input.userRoute?.length ?? 0) > 2_000) throw new Error("Operational route is too long.");
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`self-dispatch-route:${input.routeId}`}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`self-dispatch:${input.aircraftId}`}))`;
    const duplicate = await tx.pilotBooking.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (duplicate) return duplicate;
    const route = await tx.route.findUnique({ where: { id: input.routeId }, include: { departureAirport: true, arrivalAirport: true, fleetAssignments: true, fleetCompatibility: true } });
    if (!route || !route.active || route.operationalStatus !== "ACTIVE" || route.archivedAt) throw new Error("The selected route is not operationally available.");
    const occupiedRoute = await tx.pilotBooking.findFirst({ where: { routeId: route.id, status: { in: ACTIVE_BOOKING_STATUSES } }, select: { id: true } });
    if (occupiedRoute) throw new Error(`${route.flightNumber ?? route.routeCode ?? "This flight"} has already been booked by another crew.`);
    assertNativeOrigin("Self-dispatch route", route.dataOrigin);
    assertNativeIds("Self-dispatch route", { routeId: route.id, departureAirportId: route.departureAirportId, arrivalAirportId: route.arrivalAirportId });
    if (!route.departureAirport || !route.arrivalAirport) throw new Error("The route airport identity is incomplete.");
    const pilot = await tx.pilot.findUnique({ where: { id: input.pilotId }, select: { currentAirportId: true, base: true } });
    if (!pilot) throw new Error("Pilot not found.");
    let pilotAirportId = pilot.currentAirportId;
    if (!pilotAirportId) {
      const latest = await tx.pirep.findFirst({ where: { pilotId: input.pilotId, status: "accepted", arrival: { not: "" } }, orderBy: [{ acceptedAt: "desc" }, { flownAt: "desc" }, { createdAt: "desc" }], select: { arrival: true } });
      const fallbackIcao = latest?.arrival || pilot.base;
      pilotAirportId = fallbackIcao ? (await tx.airport.findUnique({ where: { icao: fallbackIcao.toUpperCase() }, select: { id: true } }))?.id ?? null : null;
    }
    if (!pilotAirportId) throw new Error("Your crew position is unknown. Set it before self-dispatch.");
    if (pilotAirportId !== route.departureAirportId) throw new Error(`Your crew is not at ${route.departureAirport.icao}. Use Jumpseat first.`);
    const duration = route.scheduledDurationMinutes;
    if (!duration || duration <= 0) throw new Error("The route has no valid scheduled duration.");
    const arrivalAt = new Date(input.departureAt.getTime() + duration * 60_000);
    const eligibility = await checkPilotEligibility(input.pilotId, { id: `self:${input.idempotencyKey}`, scheduledDeparture: input.departureAt, scheduledArrival: arrivalAt }, tx);
    if (!eligibility.allowed) throw new Error(eligibility.blockingReasons.join(" "));
    const aircraft = await tx.aircraft.findUnique({ where: { id: input.aircraftId }, include: { nativeFleet: true, conditionSnapshot: true, locationSnapshot: true } });
    if (!aircraft) throw new Error("The selected aircraft does not exist.");
    assertNativeOrigin("Self-dispatch aircraft", aircraft.dataOrigin);
    if (aircraftIsInDelivery(aircraft.rawData)) throw new Error("This aircraft is in DELIVERY lifecycle and is restricted to delivery/ferry operations.");
    if (aircraft.operationMode === "SCHEDULED") throw new Error("This aircraft is reserved for PROGRAMACION and cannot be used for a free flight.");
    const aircraftState = resolveAircraftState(aircraft);
    if (!aircraftState.available) throw new Error("The selected aircraft is not available.");
    if (!aircraft.nativeFleetId || aircraft.nativeFleet?.operationalStatus !== "ACTIVE") throw new Error("The selected aircraft Fleet is not active.");
    if (!aircraft.seatCapacity || aircraft.seatCapacity <= 0) throw new Error("Aircraft seat capacity must be configured before self-dispatch.");
    if (!aircraft.registration || !aircraft.aircraftType) throw new Error("Aircraft registration and ICAO type must be configured before AMN Payload allocation.");
    if (input.amnAllocation.routeId !== route.id || input.amnAllocation.aircraftId !== aircraft.id || input.amnAllocation.operatingDate !== input.departureAt.toISOString().slice(0, 10)) throw new Error("AMN Payload allocation does not match this operation.");
    if (input.amnAllocation.registration.toUpperCase() !== aircraft.registration.toUpperCase() || input.amnAllocation.aircraftTypeCode.toUpperCase() !== aircraft.aircraftType.toUpperCase()) throw new Error("AMN Payload allocation does not match the selected aircraft identity.");
    if (input.amnAllocation.passengers > aircraft.seatCapacity || input.amnAllocation.passengers > input.amnAllocation.sellableSeats) throw new Error("AMN passenger allocation exceeds aircraft capacity.");
    if (input.amnAllocation.cargoWeightKg > input.amnAllocation.maximumCargoWeightKg || input.amnAllocation.estimatedTrafficPayloadKg > input.amnAllocation.maximumTrafficPayloadKg) throw new Error("AMN cargo allocation exceeds aircraft capacity.");
    if (aircraftState.currentAirportId !== route.departureAirportId) throw new Error("The selected aircraft is not at the route departure airport.");
    if ((aircraftState.stale || aircraftState.external) && !input.acknowledgeLocationWarning) throw new Error("Confirm the stale or externally sourced aircraft location before self-dispatch.");
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
    const identity = (await allocateScheduleIdentities(tx, route.id)).outbound;
    const flightNumber = identity.flightNumber;
    const callsign = identity.callsign;
    const generationKey = createHash("sha256").update(`pilot-self-dispatch:${input.idempotencyKey}`).digest("hex");
    const flight = await tx.flight.create({ data: {
      dataOrigin: AocDataOrigin.HISPAFLY_NATIVE, routeId: route.id, departureAirportId: route.departureAirportId, arrivalAirportId: route.arrivalAirportId,
      operatingDate, scheduledDeparture: input.departureAt, scheduledArrival: arrivalAt, scheduledDurationMinutes: duration,
      flightNumber, callsign, departureIcao: route.departureAirport.icao, arrivalIcao: route.arrivalAirport.icao,
      departureTimezone, arrivalTimezone, departureLocalTime: `${dep.hour}:${dep.minute}`, arrivalLocalTime: `${arr.hour}:${arr.minute}`,
      fleetId: aircraft.nativeFleetId, assignedAircraftId: aircraft.id, status: NativeFlightStatus.BOOKED, bookingOpenAt: new Date(), bookingCloseAt: input.departureAt,
      generationKey, operatingType: "PILOT_SELF_DISPATCH", notes: "Pilot-created HispaFly Native self-dispatch operation.",
    } });
    const passengers = input.amnAllocation.passengers;
    const loadFactorPercent = Math.round(passengers / aircraft.seatCapacity * 1000) / 10;
    const baggageKgPerPassenger = HISPAFLY_PAYLOAD_POLICY.baggageKgPerPassenger;
    const luggageKg = passengerBaggageWeight(passengers, baggageKgPerPassenger);
    const freightKg = input.amnAllocation.cargoWeightKg;
    const cargoKg = luggageKg + freightKg;
    const booking = await tx.pilotBooking.create({ data: {
      dataOrigin: AocDataOrigin.HISPAFLY_NATIVE, pilotId: input.pilotId, flightId: flight.id, routeId: route.id, fleetId: aircraft.nativeFleetId, aircraftId: aircraft.id,
      departureIcao: flight.departureIcao, arrivalIcao: flight.arrivalIcao, flightNumber, callsign, aircraftType: aircraft.aircraftType, aircraftRegistration: aircraft.registration,
      selectedDepartureAt: input.departureAt, estimatedArrivalAt: arrivalAt, estimatedDurationMinutes: duration, status: PilotBookingStatus.CONFIRMED,
      network: input.network || "vatsim", altitude: input.altitude || route.cruiseAltitude, passengers, cargoKg, loadFactorPercent,
      baggageKgPerPassenger, luggageKg, freightKg, userRoute: input.userRoute || route.route,
      amnPayloadRequestId: input.amnAllocation.payloadRequestId, amnMarketSnapshotId: input.amnAllocation.marketSnapshotId, amnPayloadStage: input.amnAllocation.loadStage,
      amnPayloadProvenance: { ...input.amnAllocation.provenance, externalFlightId: input.amnAllocation.externalFlightId } as Prisma.InputJsonValue,
      expiresAt: input.departureAt, idempotencyKey: input.idempotencyKey, operationalNotes: "Created through HispaFly Native pilot self-dispatch.",
    } });
    await tx.aocAuditLog.create({ data: { action: "PILOT_NATIVE_SELF_DISPATCH_CREATED", entityType: "PilotBooking", entityId: booking.id, message: `Pilot created self-dispatch ${flightNumber} ${flight.departureIcao}-${flight.arrivalIcao} with AMN Payload.`, metadata: { pilotId: input.pilotId, flightId: flight.id, routeId: route.id, aircraftId: aircraft.id, departureAt: input.departureAt.toISOString(), amnPayloadRequestId: input.amnAllocation.payloadRequestId, amnMarketSnapshotId: input.amnAllocation.marketSnapshotId, baggagePolicyId: HISPAFLY_PAYLOAD_POLICY.policyId, baggageKgPerPassenger } as Prisma.InputJsonValue } });
    return booking;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
