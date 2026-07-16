import { createHash } from "node:crypto";
import { AocDataOrigin, FlightDispatchStatus, NativeFlightStatus, PilotBookingStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { checkPilotEligibility } from "./booking";
import { writeAuditLogSafely } from "@/lib/audit/log";
import { assertNativeIds, assertNativeOrigin } from "@/lib/native-cutover/write-gate";

export type NativeDispatchCheck = { key: string; status: "PASS" | "WARNING" | "BLOCK" | "NOT_REQUIRED" | "UNKNOWN"; detail: string };
export type NativeDispatchCheckResult = {
  status: "READY_FOR_RELEASE" | "CHECK_REQUIRED";
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "BLOCKED";
  checks: NativeDispatchCheck[];
  blockingItems: string[];
  warnings: string[];
  checkedAt: Date;
  inputVersions: Record<string, string | number | null>;
};

const checksum = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

async function buildSnapshot(dispatchId: string, db: Prisma.TransactionClient | typeof prisma = prisma) {
  const dispatch = await db.flightDispatch.findUnique({
    where: { id: dispatchId },
    include: {
      booking: true, flight: true, route: true, fleet: true,
      aircraft: { include: { currentAirport: true, conditionSnapshot: true, performanceProfile: true } },
      ofpBriefing: true,
    },
  });
  if (!dispatch?.booking || !dispatch.flight || !dispatch.route || !dispatch.aircraft) throw new Error("Dispatch native identity is incomplete.");
  const snapshot = {
    dispatchId: dispatch.id,
    dispatchVersion: dispatch.version,
    bookingId: dispatch.booking.id,
    flight: {
      id: dispatch.flight.id, flightNumber: dispatch.flight.flightNumber, callsign: dispatch.flight.callsign,
      operatingDate: dispatch.flight.operatingDate.toISOString().slice(0, 10),
      scheduledDepartureUtc: dispatch.flight.scheduledDeparture.toISOString(),
      scheduledArrivalUtc: dispatch.flight.scheduledArrival.toISOString(),
      departure: dispatch.flight.departureIcao, arrival: dispatch.flight.arrivalIcao,
      scheduledDurationMinutes: dispatch.flight.scheduledDurationMinutes,
    },
    route: { id: dispatch.route.id, plannedRoute: dispatch.route.route, notes: dispatch.route.internalNotes },
    aircraft: {
      id: dispatch.aircraft.id, registration: dispatch.aircraft.registration, type: dispatch.aircraft.aircraftType,
      fleetId: dispatch.aircraft.nativeFleetId, currentAirport: dispatch.aircraft.currentAirport?.icao,
      operationalStatus: dispatch.aircraft.operationalStatus,
      condition: dispatch.aircraft.conditionSnapshot?.operationalStatus,
      totalFlightMinutes: dispatch.aircraft.totalFlightMinutes, totalCycles: dispatch.aircraft.totalCycles,
      performanceProfileUpdatedAt: dispatch.aircraft.performanceProfile?.updatedAt.toISOString() ?? null,
    },
    load: {
      passengers: dispatch.booking.passengers, cargoKg: dispatch.booking.cargoKg,
      baggageKg: null, freightKg: null, payloadKg: dispatch.booking.cargoKg,
    },
    ofp: {
      briefingId: dispatch.ofpBriefing?.id ?? null,
      version: dispatch.ofpBriefing?.version ?? null,
      reference: dispatch.ofpBriefing?.simbriefStaticId ?? null,
      contentHash: dispatch.ofpBriefing?.contentHash ?? null,
      fuelPolicySnapshot: dispatch.ofpBriefing?.fuelPolicySnapshot ?? null,
      ofpSnapshot: dispatch.ofpBriefing?.ofpSnapshot ?? null,
    },
  };
  return { dispatch, snapshot, snapshotChecksum: checksum(snapshot) };
}

export async function runNativeDispatchChecks(dispatchId: string): Promise<NativeDispatchCheckResult> {
  const { dispatch } = await buildSnapshot(dispatchId);
  const booking = dispatch.booking!, flight = dispatch.flight!, aircraft = dispatch.aircraft!;
  const eligibility = await checkPilotEligibility(dispatch.pilotId, flight);
  const condition = aircraft.conditionSnapshot;
  const performance = await prisma.efbPerformanceCalculation.findMany({ where: { flightDispatchId: dispatch.id, mode: "OFFICIAL", status: { in: ["OK", "WARNING"] } }, select: { type: true } });
  const performanceTypes = new Set(performance.map(({ type }) => type));
  const checks: NativeDispatchCheck[] = [
    { key: "booking", status: ["DISPATCH_PENDING", "CONFIRMED"].includes(booking.status) ? "PASS" : "BLOCK", detail: `Booking ${booking.status}` },
    { key: "pilot", status: eligibility.allowed ? "PASS" : "BLOCK", detail: eligibility.blockingReasons.join(" ") || "Pilot eligible" },
    { key: "flight", status: ["SCHEDULED", "OPEN", "OPEN_FOR_BOOKING", "BOOKED", "DISPATCH_PENDING"].includes(flight.status) ? "PASS" : "BLOCK", detail: `Flight ${flight.status}` },
    { key: "aircraft", status: aircraft ? "PASS" : "BLOCK", detail: aircraft.registration ?? "Aircraft missing" },
    { key: "aircraftLocation", status: !flight.departureAirportId || aircraft.currentAirportId === flight.departureAirportId ? "PASS" : "BLOCK", detail: aircraft.currentAirport?.icao ?? "Unknown location" },
    { key: "maintenance", status: condition && ["AOG", "IN_MAINTENANCE"].includes(condition.operationalStatus) ? "BLOCK" : condition ? "PASS" : "UNKNOWN", detail: condition?.operationalStatus ?? "Condition not initialized" },
    { key: "ofp", status: dispatch.ofpBriefing?.ofpSnapshot && ["AWAITING_SIGNATURE", "SIGNED"].includes(dispatch.ofpBriefing.status) ? "PASS" : "BLOCK", detail: dispatch.ofpBriefing ? `OFP ${dispatch.ofpBriefing.status}` : "OFP is required" },
    { key: "fuel", status: dispatch.ofpBriefing?.fuelPolicySnapshot || dispatch.ofpBriefing?.ofpSnapshot ? "PASS" : "BLOCK", detail: dispatch.ofpBriefing?.fuelPolicySnapshot ? "Fuel policy snapshot stored" : "Fuel plan required" },
    { key: "weather", status: "WARNING", detail: "Weather reference must be reviewed before release." },
    { key: "takeoffPerformance", status: performanceTypes.has("TAKEOFF") ? "PASS" : "BLOCK", detail: performanceTypes.has("TAKEOFF") ? "Official takeoff performance available." : "Official takeoff performance is required." },
    { key: "landingPerformance", status: performanceTypes.has("LANDING") ? "PASS" : "BLOCK", detail: performanceTypes.has("LANDING") ? "Official landing performance available." : "Official landing performance is required." },
  ];
  const blockingItems = checks.filter((item) => item.status === "BLOCK" || (item.status === "UNKNOWN" && item.key === "maintenance")).map((item) => item.detail);
  const warnings = [...eligibility.warnings, ...checks.filter((item) => item.status === "WARNING").map((item) => item.detail)];
  const result: NativeDispatchCheckResult = {
    status: blockingItems.length ? "CHECK_REQUIRED" : "READY_FOR_RELEASE",
    riskLevel: blockingItems.length ? "BLOCKED" : warnings.length ? "MEDIUM" : "LOW",
    checks, blockingItems, warnings, checkedAt: new Date(),
    inputVersions: { dispatchVersion: dispatch.version, ofpVersion: dispatch.ofpBriefing?.version ?? null, aircraftUpdatedAt: aircraft.updatedAt.toISOString() },
  };
  await prisma.flightDispatch.update({ where: { id: dispatch.id }, data: { status: result.status, snapshot: (await buildSnapshot(dispatch.id)).snapshot as Prisma.InputJsonValue } });
  if (dispatch.ofpBriefing) await prisma.dispatchRelease.upsert({
    where: { ofpBriefingId: dispatch.ofpBriefing.id },
    create: { ofpBriefingId: dispatch.ofpBriefing.id, status: result.status, riskLevel: result.riskLevel, checks: result.checks as unknown as Prisma.InputJsonValue, blockingItems: result.blockingItems, warnings: result.warnings },
    update: { status: result.status, riskLevel: result.riskLevel, checks: result.checks as unknown as Prisma.InputJsonValue, blockingItems: result.blockingItems, warnings: result.warnings },
  });
  return result;
}

export async function createNativeDispatch(input: { bookingId: string; aircraftId?: string | null; actorPilotId?: string | null; actorStaffId?: string | null; idempotencyKey: string }) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`dispatch:${input.bookingId}`}))`;
    const duplicate = await tx.flightDispatch.findFirst({ where: { OR: [{ idempotencyKey: input.idempotencyKey }, { bookingId: input.bookingId, isCurrent: true }] } });
    if (duplicate) return duplicate;
    const booking = await tx.pilotBooking.findUnique({ where: { id: input.bookingId }, include: { flight: true } });
    if (!booking?.flight || !booking.routeId) throw new Error("A confirmed Native Booking with Flight identity is required.");
    assertNativeOrigin("Dispatch booking", booking.dataOrigin);
    assertNativeOrigin("Dispatch flight", booking.flight.dataOrigin);
    assertNativeIds("Dispatch", { bookingId: booking.id, flightId: booking.flight.id, routeId: booking.routeId, departureAirportId: booking.flight.departureAirportId, arrivalAirportId: booking.flight.arrivalAirportId });
    if (booking.status !== PilotBookingStatus.CONFIRMED) throw new Error("Booking is not eligible for Dispatch.");
    const aircraftId = booking.aircraftId ?? booking.flight.assignedAircraftId ?? input.aircraftId;
    if (!aircraftId) throw new Error("A concrete Aircraft is required at Dispatch.");
    const aircraft = await tx.aircraft.findUnique({ where: { id: aircraftId }, include: { conditionSnapshot: true } });
    if (!aircraft || !["AVAILABLE","FERRY_ONLY"].includes(aircraft.operationalStatus)) throw new Error("Aircraft is unavailable.");
    assertNativeOrigin("Dispatch aircraft", aircraft.dataOrigin);
    if (aircraft.conditionSnapshot && ["AOG","IN_MAINTENANCE"].includes(aircraft.conditionSnapshot.operationalStatus)) throw new Error("Aircraft maintenance status blocks Dispatch.");
    if (booking.flight.departureAirportId && aircraft.currentAirportId !== booking.flight.departureAirportId) throw new Error("Aircraft is not at departure airport.");
    const offer = await tx.flightOffer.create({ data: {
      dataOrigin: AocDataOrigin.HISPAFLY_NATIVE, title: `${booking.flight.flightNumber} Native Dispatch`,
      flightId: booking.flight.id, routeId: booking.routeId, aircraftId, fleetId: booking.fleetId,
      departureIcao: booking.flight.departureIcao, arrivalIcao: booking.flight.arrivalIcao,
      flightNumber: booking.flight.flightNumber, callsign: booking.flight.callsign,
      availableFrom: new Date(), validUntil: booking.flight.scheduledDeparture,
      scheduledDeparture: booking.flight.scheduledDeparture, scheduledArrival: booking.flight.scheduledArrival,
      estimatedDurationMinutes: booking.flight.scheduledDurationMinutes,
      aircraftType: aircraft.aircraftType, aircraftRegistration: aircraft.registration,
      status: "DISPATCHED",
    } });
    const dispatch = await tx.flightDispatch.create({ data: {
      dataOrigin: AocDataOrigin.HISPAFLY_NATIVE, flightOfferId: offer.id, bookingId: booking.id, flightId: booking.flight.id, pilotId: booking.pilotId,
      routeId: booking.routeId, fleetId: booking.fleetId, aircraftId, selectedDepartureAt: booking.flight.scheduledDeparture,
      estimatedArrivalAt: booking.flight.scheduledArrival, status: FlightDispatchStatus.CHECK_REQUIRED,
      idempotencyKey: input.idempotencyKey, expiresAt: booking.flight.scheduledDeparture,
      createdByPilotId: input.actorPilotId, createdByStaffId: input.actorStaffId,
    } });
    await tx.pilotBooking.update({ where: { id: booking.id }, data: { status: PilotBookingStatus.DISPATCH_PENDING, aircraftId } });
    await tx.flight.update({ where: { id: booking.flight.id }, data: { status: NativeFlightStatus.DISPATCH_PENDING, assignedAircraftId: aircraftId } });
    return dispatch;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function releaseNativeDispatch(input: { dispatchId: string; actorType: "PILOT" | "STAFF"; actorId: string; actorName: string; acknowledgedWarnings: string[]; comment?: string }) {
  const checks = await runNativeDispatchChecks(input.dispatchId);
  if (checks.blockingItems.length) throw new Error(checks.blockingItems.join(" "));
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`release:${input.dispatchId}`}))`;
    const { dispatch, snapshot, snapshotChecksum } = await buildSnapshot(input.dispatchId, tx);
    if (!dispatch.isCurrent) throw new Error("Only current Dispatch version can be released.");
    if (dispatch.status === FlightDispatchStatus.RELEASED) return dispatch;
    if (!dispatch.bookingId || !dispatch.flightId || !dispatch.aircraftId || !dispatch.ofpBriefing) throw new Error("Dispatch release identity is incomplete.");
    const release = await tx.dispatchRelease.upsert({
      where: { ofpBriefingId: dispatch.ofpBriefing.id },
      create: { ofpBriefingId: dispatch.ofpBriefing.id, status: "RELEASED", riskLevel: checks.riskLevel, checks: checks.checks as unknown as Prisma.InputJsonValue, warnings: checks.warnings, blockingItems: [], releasedAt: new Date(), actorType: input.actorType, actorDisplayName: input.actorName, dispatchVersion: dispatch.version, snapshotChecksum, acknowledgedWarnings: input.acknowledgedWarnings, signatureComment: input.comment, ...(input.actorType === "PILOT" ? { releasedByPilotId: input.actorId } : { releasedByStaffId: input.actorId }) },
      update: { status: "RELEASED", releasedAt: new Date(), actorType: input.actorType, actorDisplayName: input.actorName, dispatchVersion: dispatch.version, snapshotChecksum, acknowledgedWarnings: input.acknowledgedWarnings, signatureComment: input.comment, ...(input.actorType === "PILOT" ? { releasedByPilotId: input.actorId } : { releasedByStaffId: input.actorId }) },
    });
    await tx.flightDispatch.update({ where: { id: dispatch.id }, data: { status: FlightDispatchStatus.RELEASED, dispatchedAt: new Date(), releaseSnapshot: snapshot as Prisma.InputJsonValue, snapshotChecksum } });
    await tx.pilotBooking.update({ where: { id: dispatch.bookingId }, data: { status: PilotBookingStatus.DISPATCHED } });
    await tx.flight.update({ where: { id: dispatch.flightId }, data: { status: NativeFlightStatus.DISPATCHED } });
    await tx.aircraft.update({ where: { id: dispatch.aircraftId }, data: { operationalStatus: "DISPATCHED" } });
    return { dispatch, release };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function getAcarsAssignment(pilotId: string) {
  const dispatch = await prisma.flightDispatch.findFirst({ where: { pilotId, isCurrent: true, status: FlightDispatchStatus.RELEASED, dataOrigin: AocDataOrigin.HISPAFLY_NATIVE }, include: { booking: true, flight: true, route: true, fleet: true, aircraft: true, ofpBriefing: true }, orderBy: { dispatchedAt: "desc" } });
  if (!dispatch?.booking || !dispatch.flight || !dispatch.aircraft) return null;
  const ofp = dispatch.ofpBriefing?.ofpSnapshot && typeof dispatch.ofpBriefing.ofpSnapshot === "object" ? dispatch.ofpBriefing.ofpSnapshot as Record<string, unknown> : null;
  const plannedBlockFuelKg = typeof ofp?.block_fuel === "number" ? ofp.block_fuel : null;
  return {
    contractVersion: "1.0",
    dispatchId: dispatch.id,
    dispatchVersion: dispatch.version,
    bookingId: dispatch.booking.id,
    flightId: dispatch.flight.id,
    pilotId,
    flightNumber: dispatch.flight.flightNumber,
    callsign: dispatch.flight.callsign,
    operatingDate: dispatch.flight.operatingDate.toISOString().slice(0, 10),
    departureAirportId: dispatch.flight.departureAirportId,
    departureIcao: dispatch.flight.departureIcao,
    arrivalAirportId: dispatch.flight.arrivalAirportId,
    arrivalIcao: dispatch.flight.arrivalIcao,
    scheduledDepartureUtc: dispatch.flight.scheduledDeparture,
    scheduledArrivalUtc: dispatch.flight.scheduledArrival,
    route: dispatch.route?.route,
    fleetId: dispatch.fleet?.id ?? null,
    fleetCode: dispatch.fleet?.code ?? null,
    aircraftId: dispatch.aircraft.id,
    aircraftRegistration: dispatch.aircraft.registration,
    aircraftType: dispatch.aircraft.aircraftType,
    passengers: dispatch.booking.passengers,
    cargoKg: dispatch.booking.cargoKg,
    plannedBlockFuelKg,
    ofpReference: dispatch.ofpBriefing?.simbriefStaticId,
    releasedAt: dispatch.dispatchedAt,
    expiresAt: dispatch.expiresAt,
  };
}

export async function cancelOrVoidNativeDispatch(dispatchId: string, mode: "CANCEL" | "VOID", reason: string) {
  if (!reason.trim()) throw new Error("A reason is required.");
  return prisma.$transaction(async (tx) => {
    const dispatch = await tx.flightDispatch.findUnique({ where: { id: dispatchId } });
    if (!dispatch?.bookingId || !dispatch.flightId || !dispatch.aircraftId) throw new Error("Native Dispatch identity is incomplete.");
    if (mode === "VOID" && dispatch.status !== FlightDispatchStatus.RELEASED) throw new Error("Only a Released Dispatch can be voided.");
    if (mode === "CANCEL" && dispatch.status === FlightDispatchStatus.RELEASED) throw new Error("Released Dispatch must be voided.");
    if (dispatch.status === FlightDispatchStatus.FLOWN) throw new Error("In-progress or flown Dispatch cannot be changed here.");
    await tx.flightDispatch.update({ where: { id: dispatch.id }, data: mode === "VOID" ? { status: FlightDispatchStatus.VOIDED, voidedAt: new Date(), voidReason: reason } : { status: FlightDispatchStatus.CANCELLED, cancelledAt: new Date(), errorMessage: reason } });
    await tx.pilotBooking.update({ where: { id: dispatch.bookingId }, data: { status: PilotBookingStatus.CONFIRMED } });
    await tx.flight.update({ where: { id: dispatch.flightId }, data: { status: NativeFlightStatus.OPEN_FOR_BOOKING } });
    await tx.aircraft.update({ where: { id: dispatch.aircraftId }, data: { operationalStatus: "AVAILABLE" } });
  });
}

export async function expireNativeDispatches() {
  const rows = await prisma.flightDispatch.findMany({ where: { dataOrigin: AocDataOrigin.HISPAFLY_NATIVE, isCurrent: true, status: { in: [FlightDispatchStatus.DRAFT, FlightDispatchStatus.PREPARING, FlightDispatchStatus.CHECK_REQUIRED, FlightDispatchStatus.READY_FOR_RELEASE] }, expiresAt: { lt: new Date() } }, select: { id: true, bookingId: true, flightId: true, aircraftId: true } });
  for (const row of rows) await prisma.$transaction([
    prisma.flightDispatch.update({ where: { id: row.id }, data: { status: FlightDispatchStatus.EXPIRED } }),
    ...(row.bookingId ? [prisma.pilotBooking.update({ where: { id: row.bookingId }, data: { status: PilotBookingStatus.EXPIRED } })] : []),
    ...(row.flightId ? [prisma.flight.update({ where: { id: row.flightId }, data: { status: NativeFlightStatus.EXPIRED } })] : []),
    ...(row.aircraftId ? [prisma.aircraft.update({ where: { id: row.aircraftId }, data: { operationalStatus: "AVAILABLE" } })] : []),
  ]);
  if (rows.length) await writeAuditLogSafely({ action: "NATIVE_DISPATCHES_EXPIRED", entityType: "FlightDispatch", message: `${rows.length} Native Dispatch record(s) expired automatically.`, metadata: { dispatchIds: rows.map(({ id }) => id) } });
  return { expired: rows.length };
}

export const findDispatchById = (id: string) => prisma.flightDispatch.findUnique({ where: { id }, include: { booking: true, flight: true, route: true, fleet: true, aircraft: true, ofpBriefing: { include: { dispatchRelease: true } } } });
