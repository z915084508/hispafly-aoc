import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calculateFuelCostSnapshot } from "@/lib/economy/fuel";
import { calculatePassengerRevenue } from "@/lib/revenue/passengerRevenue";
import { syncPilotAutomaticRank } from "@/lib/pilot/career-service";
import { greatCircleDistanceNm, nativePirepScore, telemetrySummary, validateTelemetryBatch } from "@/lib/acars/completion";
import { ensureNativePayrollSettlement } from "@/lib/payroll/nativeSettlement";
import { generateCompanyExpensesForPirep } from "@/lib/economy/companyExpenses";
import { createOrUpdateFlightAnalysis } from "@/lib/flight-analysis/service";
import { validateNativePirep } from "@/lib/pirep/policy";

export type AcarsStartInput = {
  localSessionId: string; dispatchId: string; dispatchVersion: number; bookingId: string;
  flightId: string; aircraftId: string; simulatorName: string; acarsVersion: string; startedAt: string;
};
type PositionInput = {
  sequenceNumber: number; recordedAt: string; latitude?: number | null; longitude?: number | null;
  altitudeFeet?: number | null; groundSpeedKnots?: number | null; headingDegrees?: number | null;
  fuelKg?: number | null; onGround?: boolean | null; phase: string;
};
type EventInput = {
  sequenceNumber: number; type: string; recordedAt: string; phaseBefore?: string | null;
  phaseAfter?: string | null; message?: string | null; latitude?: number | null; longitude?: number | null;
  altitudeFeet?: number | null; groundSpeedKnots?: number | null; fuelKg?: number | null;
  numericValue?: number | null; textValue?: string | null;
};
type CompletionInput = {
  initialFuelKg?: number | null;
  finalFuelKg?: number | null;
  fuelUsedKg?: number | null;
  landingRateFeetPerMinute?: number | null;
  aircraftTypeIcao?: string | null;
};
export type TelemetryInput = {
  currentPhase: string;
  completed?: boolean;
  completion?: CompletionInput | null;
  positions?: PositionInput[];
  events?: EventInput[];
};

const nativeNetwork = (value: string | null | undefined) => value?.trim().toUpperCase() || "OFFLINE";
const roundedNonNegative = (value: number | null | undefined) =>
  value != null && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;

function trustedCompletionFuel(completion: CompletionInput | null | undefined) {
  if (!completion) return null;
  const initialFuelKg = roundedNonNegative(completion.initialFuelKg);
  const finalFuelKg = roundedNonNegative(completion.finalFuelKg);
  const suppliedFuelUsedKg = roundedNonNegative(completion.fuelUsedKg);
  const calculatedFuelUsedKg = initialFuelKg != null && finalFuelKg != null && initialFuelKg >= finalFuelKg
    ? initialFuelKg - finalFuelKg
    : null;
  const fuelUsedKg = suppliedFuelUsedKg ?? calculatedFuelUsedKg;
  if (fuelUsedKg == null) return null;
  if (calculatedFuelUsedKg != null && Math.abs(calculatedFuelUsedKg - fuelUsedKg) > 10) return null;
  return { initialFuelKg, finalFuelKg, fuelUsedKg };
}

async function completeNativePirepPostProcessing(pirepId: string) {
  const results = await Promise.allSettled([
    ensureNativePayrollSettlement(pirepId),
    generateCompanyExpensesForPirep(pirepId),
    createOrUpdateFlightAnalysis(pirepId),
  ]);
  for (const [index, result] of results.entries()) {
    if (result.status === "rejected") console.error(`[Native ACARS] post-processing step ${index + 1} failed pirep=${pirepId}`, result.reason);
  }
}

export async function startAcarsSession(pilotId: string, body: AcarsStartInput) {
  if (!body || ![body.localSessionId, body.dispatchId, body.bookingId, body.flightId, body.aircraftId, body.simulatorName, body.acarsVersion].every((value) => typeof value === "string" && value.trim())) throw new Error("Invalid ACARS session identity.");
  if (!Number.isSafeInteger(body.dispatchVersion) || body.dispatchVersion < 1) throw new Error("Invalid Dispatch version.");
  if (!Number.isFinite(new Date(body.startedAt).getTime())) throw new Error("Invalid ACARS start time.");
  const dispatch = await prisma.flightDispatch.findFirst({
    where: {
      id: body.dispatchId, pilotId, bookingId: body.bookingId, flightId: body.flightId,
      aircraftId: body.aircraftId, isCurrent: true, status: { in: ["RELEASED", "DISPATCHED"] },
      version: body.dispatchVersion,
    },
  });
  if (!dispatch) throw new Error("Released Dispatch identity mismatch.");
  return prisma.$transaction(async (tx) => {
    const existing = await tx.acarsSession.findUnique({ where: { localSessionId: body.localSessionId } });
    if (existing && (existing.pilotId !== pilotId || existing.dispatchId !== body.dispatchId || existing.bookingId !== body.bookingId || existing.flightId !== body.flightId || existing.aircraftId !== body.aircraftId)) {
      throw new Error("ACARS local session identity conflict.");
    }
    const session = await tx.acarsSession.upsert({
      where: { localSessionId: body.localSessionId },
      create: { ...body, pilotId, startedAt: new Date(body.startedAt), lastHeartbeatAt: new Date() },
      update: { lastHeartbeatAt: new Date() },
    });
    await tx.flightDispatch.update({ where: { id: dispatch.id }, data: { status: "DISPATCHED", acarsSessionId: session.id } });
    await tx.pilotBooking.update({ where: { id: body.bookingId }, data: { status: "IN_PROGRESS" } });
    await tx.flight.update({ where: { id: body.flightId }, data: { status: "IN_PROGRESS" } });
    await tx.aircraft.update({ where: { id: body.aircraftId }, data: { operationalStatus: "IN_FLIGHT" } });
    return session;
  });
}

export async function ingestTelemetry(pilotId: string, sessionId: string, body: TelemetryInput) {
  validateTelemetryBatch(body);
  const session = await prisma.acarsSession.findFirst({ where: { id: sessionId, pilotId } });
  if (!session) throw new Error("ACARS session not found.");
  if (session.status === "COMPLETED") {
    const pirep = await prisma.pirep.findUnique({ where: { acarsSessionId: session.id }, select: { id: true } });
    if (body.completed && !(body.positions?.length || body.events?.length)) {
      if (pirep) {
        const stored = await prisma.pirep.findUnique({ where: { id: pirep.id }, select: { status: true } });
        if (stored?.status === "accepted") await completeNativePirepPostProcessing(pirep.id);
      }
      return { acceptedPositions: 0, acceptedEvents: 0, completed: true, pirepId: pirep?.id ?? null };
    }
    throw new Error("ACARS session is already completed.");
  }
  let pirepId: string | null = null;
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`acars-complete:${sessionId}`}))`;
    const current = await tx.acarsSession.findUnique({ where: { id: sessionId } });
    if (!current || current.pilotId !== pilotId) throw new Error("ACARS session not found.");
    if (current.status === "COMPLETED") {
      const existing = await tx.pirep.findUnique({ where: { acarsSessionId: sessionId }, select: { id: true } });
      pirepId = existing?.id ?? null;
      return;
    }
    if (body.positions?.length) await tx.acarsPosition.createMany({
      data: body.positions.map((item) => ({ ...item, sessionId, recordedAt: new Date(item.recordedAt) })),
      skipDuplicates: true,
    });
    if (body.events?.length) await tx.acarsEvent.createMany({
      data: body.events.map((item) => ({ ...item, sessionId, recordedAt: new Date(item.recordedAt) })),
      skipDuplicates: true,
    });
    await tx.acarsSession.update({
      where: { id: sessionId },
      data: {
        lastHeartbeatAt: new Date(), currentPhase: body.currentPhase,
        status: body.completed ? "COMPLETED" : "ACTIVE", completedAt: body.completed ? new Date() : undefined,
      },
    });
    if (!body.completed) return;

    const dispatch = await tx.flightDispatch.findUnique({
      where: { id: current.dispatchId },
      include: { booking: true, flight: { include: { departureAirport: true, arrivalAirport: true } }, aircraft: { include: { locationSnapshot: true } } },
    });
    if (!dispatch?.booking || !dispatch.flight || !dispatch.aircraft || !dispatch.flight.departureAirportId || !dispatch.flight.departureAirport || !dispatch.flight.arrivalAirportId || !dispatch.flight.arrivalAirport) {
      throw new Error("ACARS completion identity is incomplete.");
    }
    if (dispatch.pilotId !== pilotId || dispatch.bookingId !== current.bookingId || dispatch.flightId !== current.flightId || dispatch.aircraftId !== current.aircraftId) {
      throw new Error("ACARS completion identity mismatch.");
    }
    const [positions, events] = await Promise.all([
      tx.acarsPosition.findMany({ where: { sessionId }, orderBy: { recordedAt: "asc" }, select: { recordedAt: true, fuelKg: true, onGround: true } }),
      tx.acarsEvent.findMany({ where: { sessionId }, orderBy: { recordedAt: "asc" }, select: { type: true, numericValue: true } }),
    ]);
    const telemetry = telemetrySummary(positions, events);
    const clientFuel = trustedCompletionFuel(body.completion);
    const fuelUsedKg = clientFuel?.fuelUsedKg ?? telemetry.fuelUsedKg;
    const finalFuelKg = clientFuel?.finalFuelKg ?? telemetry.lastFuelKg;
    const fuelDataComplete = Boolean(clientFuel) || telemetry.fuelDataComplete;
    const fuelDataSource = clientFuel ? "CLIENT_SESSION_SUMMARY" : telemetry.fuelDataComplete ? "FULL_POSITION_COVERAGE" : "INCOMPLETE_POSITION_COVERAGE";
    const clientLandingRate = body.completion?.landingRateFeetPerMinute;
    const landingRate = clientLandingRate != null && Number.isFinite(clientLandingRate)
      ? Math.round(clientLandingRate)
      : telemetry.landingRate;
    const completedAt = new Date();
    const flightDistanceNm = greatCircleDistanceNm(dispatch.flight.departureAirport, dispatch.flight.arrivalAirport);
    const score = nativePirepScore(landingRate);
    const passengers = dispatch.booking.passengers ?? 0;
    const network = nativeNetwork(dispatch.booking.network);
    const fuelEconomics = await calculateFuelCostSnapshot({
      departure: dispatch.flight.departureIcao,
      fuelUsedKg,
      at: completedAt,
    });
    const passengerRevenueCents = flightDistanceNm != null
      ? calculatePassengerRevenue(passengers, flightDistanceNm).revenueCents
      : null;
    const completionSummary = {
      ...telemetry,
      fuelUsedKg,
      fuelDataComplete,
      fuelDataSource,
      clientInitialFuelKg: clientFuel?.initialFuelKg ?? null,
      clientFinalFuelKg: clientFuel?.finalFuelKg ?? null,
      landingRate,
    };
    const duplicate = await tx.pirep.findFirst({
      where: {
        pilotId,
        flightNumber: dispatch.flight.flightNumber,
        departure: dispatch.flight.departureIcao,
        arrival: dispatch.flight.arrivalIcao,
        acarsSessionId: { not: sessionId },
        flownAt: { gte: new Date(completedAt.getTime() - 12 * 60 * 60 * 1000), lte: completedAt },
      },
      select: { id: true },
    });
    const validation = validateNativePirep({
      positionCount: positions.length,
      finalOnGround: positions.at(-1)?.onGround === true,
      currentPhase: body.currentPhase,
      reportedAircraftType: body.completion?.aircraftTypeIcao,
      authorizedAircraftType: dispatch.aircraft.aircraftType,
      duplicate: Boolean(duplicate),
      flightTimeMinutes: telemetry.flightTimeMinutes,
      blockTimeMinutes: telemetry.blockTimeMinutes,
    });
    const pirep = await tx.pirep.create({
      data: {
        dataOrigin: "HISPAFLY_NATIVE", acarsSessionId: sessionId, pilotId,
        flightNumber: dispatch.flight.flightNumber, callsign: dispatch.flight.callsign,
        departure: dispatch.flight.departureIcao, arrival: dispatch.flight.arrivalIcao,
        aircraftType: dispatch.aircraft.aircraftType, aircraftRegistration: dispatch.aircraft.registration,
        network, flightTimeMinutes: telemetry.flightTimeMinutes,
        blockTimeMinutes: telemetry.blockTimeMinutes, landingRate,
        score, points: score, fuelUsed: fuelUsedKg, passengers,
        cargoKg: dispatch.booking.cargoKg ?? 0, luggageKg: dispatch.booking.luggageKg ?? 0,
        freightKg: dispatch.booking.freightKg ?? 0, flightDistanceNm, passengerRevenueCents,
        fuelCostCents: fuelEconomics.fuelCostCents,
        fuelPricePerKgCents: fuelEconomics.fuelPricePerKgCents,
        fuelPriceRegion: fuelEconomics.fuelPriceRegion,
        fuelPriceSource: fuelEconomics.fuelPriceSource,
        fuelCalculationDetails: {
          method: fuelDataComplete ? "trusted_complete_fuel_x_effective_price" : "fuel_unavailable_incomplete_coverage",
          fuelUsedKg,
          fuelDataComplete,
          fuelDataSource,
          ...fuelEconomics,
        } as Prisma.InputJsonValue,
        status: validation.status, rejectCode: validation.rejectCode, staffComment: validation.comment,
        reviewedByName: validation.status === "accepted" ? "HISPAFLY ACARS Policy v1" : "HISPAFLY ACARS Automatic Validation",
        reviewedAt: completedAt,
        rejectedAt: validation.status === "rejected" ? completedAt : null,
        acceptedAt: validation.status === "accepted" ? completedAt : null,
        acarsSoftware: current.acarsVersion,
        source: "HISPAFLY_ACARS", flownAt: completedAt,
        rawData: { contractVersion: "1.1", sessionId, dispatchId: dispatch.id, summary: completionSummary, flightDistanceNm, score } as Prisma.InputJsonValue,
      },
    });
    await tx.pirepReview.create({ data: { pirepId: pirep.id, fromStatus: "validation", toStatus: validation.status, rejectCode: validation.rejectCode, staffComment: validation.comment, reviewerName: "HISPAFLY ACARS Automatic Validation", automatic: true, impact: { flightHoursCredited: validation.status === "accepted", walletRewardCredited: validation.status === "accepted", rankProgressCredited: validation.status === "accepted" } } });
    pirepId = pirep.id;
    await tx.flightDispatch.update({ where: { id: dispatch.id }, data: { status: "FLOWN", completedAt, matchedPirepId: pirep.id, errorMessage: null } });
    await tx.pilotBooking.update({ where: { id: dispatch.booking.id }, data: { status: "COMPLETED", matchedPirepId: pirep.id, errorMessage: null } });
    await tx.flight.update({ where: { id: dispatch.flight.id }, data: { status: "COMPLETED" } });
    await tx.aircraft.update({
      where: { id: dispatch.aircraft.id },
      data: { operationalStatus: "AVAILABLE", currentAirportId: dispatch.flight.arrivalAirportId, totalFlightMinutes: { increment: telemetry.flightTimeMinutes ?? 0 }, totalCycles: { increment: 1 }, ...(finalFuelKg != null ? { fuelOnBoardKg: Math.max(0, Math.round(finalFuelKg)), fuelReportedAt: completedAt } : {}) },
    });
    await tx.aircraftLocationSnapshot.upsert({
      where: { aircraftId: dispatch.aircraft.id },
      create: { aircraftId: dispatch.aircraft.id, vamsysAircraftId: dispatch.aircraft.vamsysAircraftId ?? `native:${dispatch.aircraft.id}`, registration: dispatch.aircraft.registration, aircraftType: dispatch.aircraft.aircraftType, currentAirportId: dispatch.flight.arrivalAirportId, currentAirportIcao: dispatch.flight.arrivalIcao, currentAirportIata: dispatch.flight.arrivalAirport.iata, status: "AVAILABLE", source: "NATIVE_PIREP", lastBookingId: dispatch.booking.id, lastPirepId: pirep.id, lastReportAt: completedAt, lastLatitude: dispatch.flight.arrivalAirport.latitude, lastLongitude: dispatch.flight.arrivalAirport.longitude },
      update: { currentAirportId: dispatch.flight.arrivalAirportId, currentAirportIcao: dispatch.flight.arrivalIcao, currentAirportIata: dispatch.flight.arrivalAirport.iata, status: "AVAILABLE", source: "NATIVE_PIREP", reservedByDispatchId: null, lastBookingId: dispatch.booking.id, lastPirepId: pirep.id, lastReportAt: completedAt, lastLatitude: dispatch.flight.arrivalAirport.latitude, lastLongitude: dispatch.flight.arrivalAirport.longitude },
    });
    await tx.pilot.update({ where: { id: pilotId }, data: { currentAirportId: dispatch.flight.arrivalAirportId, positionUpdatedAt: completedAt, positionSource: "NATIVE_PIREP" } });
    await tx.aocAuditLog.create({ data: { action: "NATIVE_ACARS_FLIGHT_COMPLETED", entityType: "Pirep", entityId: pirep.id, message: `${dispatch.flight.flightNumber} completed by HispaFly ACARS with PIREP status ${validation.status}.`, metadata: { sessionId, dispatchId: dispatch.id, bookingId: dispatch.booking.id, flightId: dispatch.flight.id, aircraftId: dispatch.aircraft.id, arrivalIcao: dispatch.flight.arrivalIcao, validation, summary: completionSummary, flightDistanceNm, score, fuelEconomics } as Prisma.InputJsonValue } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (body.completed && pirepId) {
    const completedPirep = await prisma.pirep.findUnique({ where: { id: pirepId }, select: { status: true } });
    if (completedPirep?.status === "accepted") await completeNativePirepPostProcessing(pirepId);
    await syncPilotAutomaticRank(pilotId);
  }
  return { acceptedPositions: body.positions?.length ?? 0, acceptedEvents: body.events?.length ?? 0, completed: Boolean(body.completed), pirepId };
}
