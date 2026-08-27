"use server";

import { dispositionScore } from "@/lib/pirep/event-disposition";
import { finite, loadScoringPolicy } from "@/lib/pirep/scoring";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { greatCircleDistanceNm, nativePirepScore, telemetrySummary } from "@/lib/acars/completion";
import { generateCompanyExpensesForPirep } from "@/lib/economy/companyExpenses";
import { calculateFuelCostSnapshot } from "@/lib/economy/fuel";
import { createOrUpdateFlightAnalysis } from "@/lib/flight-analysis/service";
import { ensureNativePayrollSettlement } from "@/lib/payroll/nativeSettlement";
import { prisma } from "@/lib/prisma";
import { calculatePassengerRevenue } from "@/lib/revenue/passengerRevenue";
import { requireStaffPermission } from "@/lib/staff/authorization";
import { reviewPirep } from "@/lib/pirep/review";
import type { PirepRejectCode } from "@prisma/client";

function finish(id: string, type: "success" | "error", message: string): never {
  revalidatePath(`/staff/pireps/${id}`);
  revalidatePath(`/pilot/pireps/${id}`);
  revalidatePath("/staff/pireps");
  revalidatePath("/pilot/dashboard");
  revalidatePath("/staff/expenses");
  redirect(`/staff/pireps/${id}?${type}=${encodeURIComponent(message)}`);
}

async function authorize(id: string, action: string, permission: "PIREP_SCORE" | "PIREP_ACCEPT" | "PIREP_REJECT" = "PIREP_SCORE") {
  return requireStaffPermission(permission, {
    entityType: "Pirep",
    entityId: id,
    attemptedAction: action,
  });
}

const jsonRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export async function refreshVamsysPirepDetail(id: string) {
  await authorize(id, "attempt disabled historical PIREP refresh");
  finish(id, "error", "External PIREP refresh is permanently disabled.");
}

export async function acceptPirep(id: string) {
  try {
    const staff = await authorize(id, "accept PIREP", "PIREP_ACCEPT");
    await reviewPirep({ pirepId: id, toStatus: "accepted", staffComment: "Accepted by staff review.", reviewer: staff });
  } catch (error) {
    finish(id, "error", error instanceof Error ? error.message : "PIREP could not be accepted.");
  }
  finish(id, "success", "PIREP accepted. Eligible hours, wallet reward and rank progress have been settled idempotently.");
}

export async function sendPirepToManualReview(id: string, formData: FormData) {
  try {
    const staff = await authorize(id, "send PIREP to manual review");
    await reviewPirep({ pirepId: id, toStatus: "manual_review", staffComment: String(formData.get("staffComment") ?? "").trim() || "Manual review requested by staff.", reviewer: staff });
  } catch (error) {
    finish(id, "error", error instanceof Error ? error.message : "PIREP could not be sent to review.");
  }
  finish(id, "success", "PIREP sent to Manual Review.");
}

export async function rejectPirep(id: string, formData: FormData) {
  try {
    const staff = await authorize(id, "reject PIREP", "PIREP_REJECT");
    await reviewPirep({ pirepId: id, toStatus: "rejected", rejectCode: String(formData.get("rejectCode") ?? "") as PirepRejectCode, staffComment: String(formData.get("staffComment") ?? ""), reviewer: staff });
  } catch (error) {
    finish(id, "error", error instanceof Error ? error.message : "PIREP could not be rejected.");
  }
  finish(id, "success", "PIREP rejected. The record and audit history were retained; credited hours, wallet reward and rank progress are zero.");
}

export async function reprocessPirepEconomy(id: string) {
  let feedback: { type: "success" | "error"; message: string };

  try {
    const staff = await authorize(id, "reprocesar las métricas y la economía del PIREP");
    const pirep = await prisma.pirep.findFirst({
      where: { id, status: "accepted" },
      include: { acarsSession: true },
    });
    if (!pirep) throw new Error("PIREP aceptado no encontrado.");

    const nativeDispatch = pirep.acarsSession
      ? await prisma.flightDispatch.findUnique({
        where: { id: pirep.acarsSession.dispatchId },
        include: {
          booking: true,
          flight: { include: { departureAirport: true, arrivalAirport: true } },
        },
      })
      : null;
    const nativeFlight = nativeDispatch?.flight;
    const flightDistanceNm = pirep.flightDistanceNm ?? (nativeFlight?.departureAirport && nativeFlight.arrivalAirport
      ? greatCircleDistanceNm(nativeFlight.departureAirport, nativeFlight.arrivalAirport)
      : null);
    const score = pirep.score ?? (pirep.dataOrigin === "HISPAFLY_NATIVE" ? nativePirepScore(pirep.landingRate) : null);
    const points = pirep.points ?? score;
    const passengers = pirep.passengers ?? nativeDispatch?.booking?.passengers ?? 0;
    const network = pirep.network?.trim().toUpperCase()
      || nativeDispatch?.booking?.network?.trim().toUpperCase()
      || "OFFLINE";

    let fuelUsedKg = pirep.fuelUsed;
    let fuelDataComplete: boolean | null = null;
    let fuelDataSource: string | null = null;
    let telemetry: ReturnType<typeof telemetrySummary> | null = null;
    if (pirep.acarsSessionId) {
      const [positions, events] = await Promise.all([
        prisma.acarsPosition.findMany({
          where: { sessionId: pirep.acarsSessionId },
          orderBy: { recordedAt: "asc" },
          select: { recordedAt: true, fuelKg: true, onGround: true },
        }),
        prisma.acarsEvent.findMany({
          where: { sessionId: pirep.acarsSessionId },
          orderBy: { recordedAt: "asc" },
          select: { type: true, numericValue: true },
        }),
      ]);
      telemetry = telemetrySummary(positions, events);
      fuelUsedKg = telemetry.fuelUsedKg;
      fuelDataComplete = telemetry.fuelDataComplete;
      fuelDataSource = telemetry.fuelDataComplete ? "FULL_POSITION_COVERAGE" : "INCOMPLETE_POSITION_COVERAGE";
    }

    const passengerRevenueCents = flightDistanceNm !== null
      ? calculatePassengerRevenue(passengers, flightDistanceNm).revenueCents
      : null;
    const fuel = await calculateFuelCostSnapshot({
      departure: pirep.departure,
      fuelUsedKg,
      at: pirep.flownAt ?? pirep.acceptedAt,
    });
    const existingRaw = jsonRecord(pirep.rawData);
    const existingSummary = jsonRecord(existingRaw.summary);
    const repairedRawData = {
      ...existingRaw,
      contractVersion: "1.1-reprocessed",
      summary: {
        ...existingSummary,
        ...(telemetry ?? {}),
        fuelUsedKg,
        fuelDataComplete,
        fuelDataSource,
      },
    } as Prisma.InputJsonValue;

    await prisma.pirep.update({
      where: { id },
      data: {
        network,
        passengers,
        cargoKg: pirep.cargoKg ?? 0,
        luggageKg: pirep.luggageKg ?? 0,
        freightKg: pirep.freightKg ?? 0,
        fuelUsed: fuelUsedKg,
        flightDistanceNm,
        score,
        points,
        passengerRevenueCents,
        rawData: repairedRawData,
        fuelCalculationDetails: {
          method: fuelDataComplete === false ? "fuel_unavailable_incomplete_coverage" : "reprocessed_fuel_x_effective_price",
          fuelUsedKg,
          fuelDataComplete,
          fuelDataSource,
          ...fuel,
        } as Prisma.InputJsonValue,
        ...fuel,
      },
    });

    const [payroll, expenses, analysis] = await Promise.all([
      ensureNativePayrollSettlement(id),
      generateCompanyExpensesForPirep(id),
      createOrUpdateFlightAnalysis(id),
    ]);
    await prisma.aocAuditLog.create({
      data: {
        staffUserId: staff.id,
        action: "PIREP_METRICS_ECONOMY_REPROCESSED",
        entityType: "Pirep",
        entityId: id,
        message: `${staff.name} reprocessed metrics and company economy for PIREP ${pirep.vamsysPirepId ?? pirep.id}.`,
        metadata: { network, passengers, fuelUsedKg, fuelDataComplete, fuelDataSource, flightDistanceNm, score, points, passengerRevenueCents, fuelCostCents: fuel.fuelCostCents, payroll, analysisId: analysis?.id ?? null, expensesGenerated: expenses.generated, expenseTotalCents: expenses.totalCents },
      },
    });
    feedback = fuelDataComplete === false
      ? { type: "success", message: "Carga, red y nómina reparadas. La telemetría de combustible no cubre el vuelo completo, por lo que el combustible y su eficiencia se han excluido del informe." }
      : { type: "success", message: "Métricas, combustible, nómina y economía recalculados con las reglas actuales." };
  } catch (error) {
    feedback = { type: "error", message: error instanceof Error ? error.message : "No se pudo reprocesar el PIREP." };
  }

  finish(id, feedback.type, feedback.message);
}

export async function setEventDisposition(pirepId: string, eventId: string, formData: FormData) {
  const staff = await authorize(pirepId, "disposition FOQA event");
  const status = String(formData.get("status") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason || reason.length > 2000) throw new Error("An audit reason of 1–2000 characters is required.");
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pirep-score:${pirepId}`}))`;
    const pirep = await tx.pirep.findUnique({ where: { id: pirepId }, include: { operationalEvents: true, flightDispatch: { include: { flight: true } } } });
    if (!pirep) throw new Error("PIREP not found.");
    const event = pirep.operationalEvents.find(e => e.id === eventId);
    if (!event) throw new Error("Operational event not found in this PIREP.");
    const policy = await loadScoringPolicy(tx, pirep.flightDispatch?.flight.fleetId);
    const efficiency = finite(jsonRecord(pirep.scoringDetails).efficiencyScore);
    const scoring = dispositionScore(policy, pirep.operationalEvents, eventId, status, efficiency, { landingG: pirep.landingG, landingRate: pirep.landingRate });
    await tx.operationalEvent.update({ where: { id: event.id }, data: { status, dispositionReason: reason, reviewedById: staff.id, reviewedByName: staff.name, reviewedAt: new Date() } });
    const applied = (scoring.details as { appliedRules: Array<{ eventId: string | null; impact: number; requiresReview: boolean }> }).appliedRules;
    // Reapply caps to all events: dismissing one light event can free capacity for another.
    for (const rule of applied) if (rule.eventId) await tx.operationalEvent.update({ where: { id: rule.eventId }, data: { scoreImpact: rule.impact, requiresReview: rule.requiresReview } });
    await tx.pirep.update({ where: { id: pirepId }, data: { score: scoring.totalScore, points: scoring.totalScore, scoringDetails: scoring.details } });
    await tx.aocAuditLog.create({ data: { staffUserId: staff.id === "development-staff" ? null : staff.id, action: "FOQA_EVENT_DISPOSITION", entityType: "OperationalEvent", entityId: eventId,
      message: `${staff.name}: ${event.eventType} ${event.status} → ${status}: ${reason}`,
      metadata: { pirepId, reason, reviewer: staff.name, before: { status: event.status, impact: event.scoreImpact, originalImpact: event.originalImpact, finalScore: pirep.score }, after: { status, finalScore: scoring.totalScore }, evidenceRetained: true } } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  finish(pirepId, "success", "Event disposition saved. FOQA score recalculated; evidence and audit history retained.");
}
