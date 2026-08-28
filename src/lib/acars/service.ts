import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calculateFuelCostSnapshot } from "@/lib/economy/fuel";
import { calculatePassengerRevenue } from "@/lib/revenue/passengerRevenue";
import { syncPilotAutomaticRank } from "@/lib/pilot/career-service";
import { greatCircleDistanceNm, telemetrySummary, validateTelemetryBatch } from "@/lib/acars/completion";
import { ensureNativePayrollSettlement } from "@/lib/payroll/nativeSettlement";
import { generateCompanyExpensesForPirep } from "@/lib/economy/companyExpenses";
import { createOrUpdateFlightAnalysis } from "@/lib/flight-analysis/service";
import { validateNativePirep } from "@/lib/pirep/policy";
import { normalizeOperationalEvents, mergeOperationalBuffer, type OperationalEventInput } from "@/lib/acars/operational-events";
import { calculatePirepScore, loadScoringPolicy } from "@/lib/pirep/scoring";

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
  landingG?: number | null;
  aircraftTypeIcao?: string | null;
};
export type TelemetryInput = {
  currentPhase: string;
  completed?: boolean;
  completion?: CompletionInput | null;
  positions?: PositionInput[];
  events?: EventInput[];
  operationalEvents?: OperationalEventInput[];
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
    const operationalBuffer = mergeOperationalBuffer(current.operationalEventBuffer, body.operationalEvents ?? []);
    await tx.acarsSession.update({
      where: { id: sessionId },
      data: {
        lastHeartbeatAt: new Date(), currentPhase: body.currentPhase,
        operationalEventBuffer: JSON.parse(JSON.stringify(operationalBuffer)) as Prisma.InputJsonValue,
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
      tx.acarsEvent.findMany({ where: { sessionId }, orderBy: { recordedAt: "asc" } }),
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
    const landingG = body.completion?.landingG != null && Number.isFinite(body.completion.landingG) && body.completion.landingG > 0.2 && body.completion.landingG < 6
      ? Math.round(body.completion.landingG * 1000) / 1000 : null;
    const completedAt = new Date();
    const finalPosition = await tx.acarsPosition.findFirst({ where: { sessionId, onGround: true, latitude: { not: null }, longitude: { not: null } }, orderBy: { recordedAt: "desc" } });
    const airports = finalPosition ? await tx.airport.findMany({ where: { status: "ACTIVE", latitude: { not: null }, longitude: { not: null } }, select: { id: true, icao: true, iata: true, latitude: true, longitude: true } }) : [];
    const closestAirport = finalPosition ? airports.map((airport) => ({ airport, distance: greatCircleDistanceNm({ latitude: finalPosition.latitude, longitude: finalPosition.longitude }, airport) ?? Number.POSITIVE_INFINITY })).sort((a, b) => a.distance - b.distance)[0] : null;
    const actualAirport = closestAirport && closestAirport.distance <= 15 ? closestAirport.airport : dispatch.flight.arrivalAirport;
    const diverted = actualAirport.icao !== dispatch.flight.arrivalIcao;
    const flightDistanceNm = greatCircleDistanceNm(dispatch.flight.departureAirport, actualAirport);
    const operationalEvents = normalizeOperationalEvents(events, operationalBuffer, sessionId);
    // An interrupted/restarted client may never send closure. Retain that evidence without estimating duration or peak.
    for (const event of operationalEvents) {
      if (event.source === "ACARS_FOQA" && event.scoreEligible && !event.endedAt) {
        event.status = "DATA_QUALITY"; event.scoreEligible = false; event.scoreImpact = 0;
        event.metadata.dataQualityReason = "Episode closure missing at completion";
      }
    }
    // Touchdown sensor/completion evidence is authoritative for landing quality. Do not also score a client FOQA copy.
    const clientLandingEvidence = operationalEvents.filter(e => e.eventType === "LANDING_QUALITY");
    const touchdowns = events.filter(e => e.type === "Landing");
    if (touchdowns.length || landingG != null || landingRate != null)
      for (let i = operationalEvents.length - 1; i >= 0; i--) if (operationalEvents[i].eventType === "LANDING_QUALITY") operationalEvents.splice(i, 1);
    for (const [index, touchdown] of touchdowns.entries()) {
      operationalEvents.push({ episodeId: `touchdown:${touchdown.sequenceNumber}`, eventType: "LANDING_QUALITY", ruleCode: "LANDING_QUALITY_V2",
        timestamp: touchdown.recordedAt, startedAt: touchdown.recordedAt, confirmedAt: touchdown.recordedAt,
        status: "CONFIRMED", severity: "INFO", flightPhase: "LANDING", source: "AOC_AUTO", scoreEligible: true,
        scoreImpact: 0, originalImpact: 0, requiresReview: false,
        metadata: { landingG: index === touchdowns.length - 1 ? landingG : null, landingRate: touchdown.numericValue ?? landingRate, clientLandingEvidence: clientLandingEvidence.map(e => e.metadata) } });
    }
    if (!touchdowns.length && (landingG != null || landingRate != null)) operationalEvents.push({ episodeId: "completion-touchdown", eventType: "LANDING_QUALITY", ruleCode: "LANDING_QUALITY_V2", timestamp: completedAt,
      status: "CONFIRMED", severity: "INFO", flightPhase: "LANDING", source: "AOC_AUTO", scoreEligible: true, scoreImpact: 0, originalImpact: 0, requiresReview: false,
      metadata: { landingG, landingRate, evidenceSource: "COMPLETION_SUMMARY" } });
    if (diverted && !operationalEvents.some(e => e.eventType === "DIVERSION")) operationalEvents.push({ episodeId: "diversion", eventType: "DIVERSION", ruleCode: "DIVERSION_V2", timestamp: completedAt,
      severity: "NOTICE", status: "CONFIRMED", source: "AOC_AUTO", flightPhase: "Completed", scoreEligible: true, scoreImpact: 0, originalImpact: 0, requiresReview: true,
      metadata: { plannedDestination: dispatch.flight.arrivalIcao, actualDestination: actualAirport.icao } });
    const scoringPolicy = await loadScoringPolicy(tx, dispatch.flight.fleetId);
    const scoring = calculatePirepScore(scoringPolicy, operationalEvents, null, { landingG, landingRate });
    const appliedRules = (scoring.details as { appliedRules: Array<{ episodeId: string | null; code: string; impact: number; originalImpact: number; requiresReview: boolean }> }).appliedRules;
    for (const event of operationalEvents) {
      const applied = appliedRules.find(r => r.episodeId === event.episodeId && r.code === event.eventType);
      if (applied) { event.scoreImpact = applied.impact; event.originalImpact = applied.originalImpact; event.requiresReview = applied.requiresReview; }
    }
    const score = scoring.totalScore;
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
      landingG,
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
    let validation = validateNativePirep({
      positionCount: positions.length,
      finalOnGround: positions.at(-1)?.onGround === true,
      currentPhase: body.currentPhase,
      reportedAircraftType: body.completion?.aircraftTypeIcao,
      authorizedAircraftType: dispatch.aircraft.aircraftType,
      duplicate: Boolean(duplicate),
      flightTimeMinutes: telemetry.flightTimeMinutes,
      blockTimeMinutes: telemetry.blockTimeMinutes,
    });
    if (validation.status === "accepted" && scoring.invalidated) validation = { status: "rejected", rejectCode: "R07", comment: "The scoring policy detected an invalid flight-integrity event." };
    else if (validation.status === "accepted" && scoring.requiresReview) validation = { status: "manual_review", rejectCode: "R07", comment: "A confirmed FOQA episode requires Staff review." };
    const pirep = await tx.pirep.create({
      data: {
        dataOrigin: "HISPAFLY_NATIVE", acarsSessionId: sessionId, pilotId,
        flightNumber: dispatch.flight.flightNumber, callsign: dispatch.flight.callsign,
        departure: dispatch.flight.departureIcao, arrival: actualAirport.icao,
        plannedArrival: dispatch.flight.arrivalIcao, actualArrival: actualAirport.icao,
        diverted, diversionReason: diverted ? "OTHER" : null,
        aircraftType: dispatch.aircraft.aircraftType, aircraftRegistration: dispatch.aircraft.registration,
        network, flightTimeMinutes: telemetry.flightTimeMinutes,
        blockTimeMinutes: telemetry.blockTimeMinutes, landingRate, landingG,
        score, points: score, scoringDetails: scoring.details, fuelUsed: fuelUsedKg, passengers,
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
        reviewedByName: "HISPAFLY ACARS Policy v2",
        reviewedAt: completedAt,
        rejectedAt: validation.status === "rejected" ? completedAt : null,
        acceptedAt: validation.status === "accepted" ? completedAt : null,
        acarsSoftware: current.acarsVersion,
        source: "HISPAFLY_ACARS", flownAt: completedAt,
        rawData: { contractVersion: "1.3", sessionId, dispatchId: dispatch.id, summary: completionSummary, landingG, flightDistanceNm, score, diverted } as Prisma.InputJsonValue,
        operationalEvents: { create: operationalEvents.map(event => ({ ...event,
          aircraftSnapshot: event.aircraftSnapshot == null ? Prisma.JsonNull : JSON.parse(JSON.stringify(event.aircraftSnapshot)) as Prisma.InputJsonValue,
          metadata: JSON.parse(JSON.stringify(event.metadata)) as Prisma.InputJsonValue,
        })) },
      },
    });
    await tx.pirepReview.create({ data: { pirepId: pirep.id, fromStatus: "validation", toStatus: validation.status, rejectCode: validation.rejectCode, staffComment: validation.comment, reviewerName: "HISPAFLY ACARS Policy v2", automatic: true, impact: { flightHoursCredited: validation.status === "accepted", walletRewardCredited: validation.status === "accepted", rankProgressCredited: validation.status === "accepted" } } });
    pirepId = pirep.id;
    await tx.flightDispatch.update({ where: { id: dispatch.id }, data: { status: "FLOWN", completedAt, matchedPirepId: pirep.id, errorMessage: null } });
    await tx.pilotBooking.update({ where: { id: dispatch.booking.id }, data: { status: "COMPLETED", matchedPirepId: pirep.id, errorMessage: null } });
    await tx.flight.update({ where: { id: dispatch.flight.id }, data: { status: "COMPLETED" } });
    await tx.aircraft.update({
      where: { id: dispatch.aircraft.id },
      data: { operationalStatus: "AVAILABLE", currentAirportId: actualAirport.id, totalFlightMinutes: { increment: telemetry.flightTimeMinutes ?? 0 }, totalCycles: { increment: 1 }, ...(finalFuelKg != null ? { fuelOnBoardKg: Math.max(0, Math.round(finalFuelKg)), fuelReportedAt: completedAt } : {}) },
    });
    await tx.aircraftLocationSnapshot.upsert({
      where: { aircraftId: dispatch.aircraft.id },
      create: { aircraftId: dispatch.aircraft.id, vamsysAircraftId: dispatch.aircraft.vamsysAircraftId ?? `native:${dispatch.aircraft.id}`, registration: dispatch.aircraft.registration, aircraftType: dispatch.aircraft.aircraftType, currentAirportId: actualAirport.id, currentAirportIcao: actualAirport.icao, currentAirportIata: actualAirport.iata, status: "AVAILABLE", source: "NATIVE_PIREP", lastBookingId: dispatch.booking.id, lastPirepId: pirep.id, lastReportAt: completedAt, lastLatitude: actualAirport.latitude, lastLongitude: actualAirport.longitude },
      update: { currentAirportId: actualAirport.id, currentAirportIcao: actualAirport.icao, currentAirportIata: actualAirport.iata, status: "AVAILABLE", source: "NATIVE_PIREP", reservedByDispatchId: null, lastBookingId: dispatch.booking.id, lastPirepId: pirep.id, lastReportAt: completedAt, lastLatitude: actualAirport.latitude, lastLongitude: actualAirport.longitude },
    });
    if (validation.status === "accepted") await tx.aircraftMovement.create({ data: {
      aircraftId: dispatch.aircraft.id,
      flightId: dispatch.flight.id,
      pirepId: pirep.id,
      departureIcao: dispatch.flight.departureIcao,
      arrivalIcao: actualAirport.icao,
      departedAt: telemetry.flightTimeMinutes ? new Date(completedAt.getTime() - telemetry.flightTimeMinutes * 60_000) : dispatch.selectedDepartureAt,
      arrivedAt: completedAt,
      blockMinutes: telemetry.flightTimeMinutes ?? null,
    } });
    await tx.pilot.update({ where: { id: pilotId }, data: { currentAirportId: actualAirport.id, positionUpdatedAt: completedAt, positionSource: "NATIVE_PIREP" } });
    await tx.aocAuditLog.create({ data: { action: "NATIVE_ACARS_FLIGHT_COMPLETED", entityType: "Pirep", entityId: pirep.id, message: `${dispatch.flight.flightNumber} completed by HispaFly ACARS with PIREP status ${validation.status}.`, metadata: { sessionId, dispatchId: dispatch.id, bookingId: dispatch.booking.id, flightId: dispatch.flight.id, aircraftId: dispatch.aircraft.id, plannedArrivalIcao: dispatch.flight.arrivalIcao, actualArrivalIcao: actualAirport.icao, diverted, validation, summary: completionSummary, flightDistanceNm, score, fuelEconomics } as Prisma.InputJsonValue } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (body.completed && pirepId) {
    const completedPirep = await prisma.pirep.findUnique({ where: { id: pirepId }, select: { status: true } });
    if (completedPirep?.status === "accepted") await completeNativePirepPostProcessing(pirepId);
    else await createOrUpdateFlightAnalysis(pirepId);
    await syncPilotAutomaticRank(pilotId);
  }
  return { acceptedPositions: body.positions?.length ?? 0, acceptedEvents: body.events?.length ?? 0, completed: Boolean(body.completed), pirepId };
}
