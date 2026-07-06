import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLogSafely } from "@/lib/audit/log";
import { difference, differencePercent, durationMinutes, efficiencyScore, numericValue } from "./calculations";

type JsonRow = Record<string, unknown>;
const record = (value: unknown): JsonRow | null => value && typeof value === "object" && !Array.isArray(value) ? value as JsonRow : null;

function deepValue(root: unknown, keys: string[]): unknown {
  const queue: unknown[] = [root];
  while (queue.length) {
    const value = queue.shift();
    if (!value || typeof value !== "object") continue;
    for (const [key, child] of Object.entries(value as JsonRow)) {
      if (keys.includes(key.toLowerCase())) return child;
      if (child && typeof child === "object") queue.push(child);
    }
  }
  return null;
}

function plannedValues(snapshot: unknown) {
  const root = record(snapshot), data = record(root?.data), source = data ?? root;
  return {
    blockMinutes: durationMinutes(deepValue(source, ["est_block", "block_time", "planned_block_time"])),
    flightMinutes: durationMinutes(deepValue(source, ["est_time_enroute", "air_time", "flight_time", "planned_flight_time"])),
    tripFuelKg: numericValue(deepValue(source, ["enroute_burn", "trip_fuel", "trip", "planned_trip_fuel"])),
    route: String(deepValue(source, ["route_ifps", "route", "planned_route"]) ?? "").trim() || null,
    distanceNm: numericValue(deepValue(source, ["air_distance", "distance", "planned_distance_nm"])),
  };
}

async function calibrateFuelBias(vamsysAircraftId: string | null, reportId: string) {
  if (!vamsysAircraftId) {
    await writeAuditLogSafely({ action: "FUEL_BIAS_CALIBRATION_SKIPPED", entityType: "FlightAnalysisReport", entityId: reportId, message: "Fuel bias calibration skipped because aircraft ID is missing." });
    return;
  }
  const aircraft = await prisma.aircraft.findUnique({ where: { vamsysAircraftId }, include: { performanceProfile: true } });
  if (!aircraft?.performanceProfile) {
    await writeAuditLogSafely({ action: "FUEL_BIAS_CALIBRATION_SKIPPED", entityType: "FlightAnalysisReport", entityId: reportId, message: "Fuel bias calibration skipped because no aircraft performance profile exists.", metadata: { vamsysAircraftId } });
    return;
  }
  if (aircraft.performanceProfile.locked) {
    await writeAuditLogSafely({ action: "FUEL_BIAS_CALIBRATION_SKIPPED", entityType: "AircraftPerformanceProfile", entityId: aircraft.performanceProfile.id, message: "Fuel bias calibration skipped because the profile is locked.", metadata: { vamsysAircraftId } });
    return;
  }
  const samples = await prisma.flightAnalysisReport.findMany({ where: { pirep: { vamsysAircraftId }, fuelDiffPercent: { not: null } }, select: { fuelDiffPercent: true }, orderBy: { createdAt: "desc" }, take: 50 });
  const valid = samples.flatMap((item) => item.fuelDiffPercent === null || !Number.isFinite(item.fuelDiffPercent) ? [] : [item.fuelDiffPercent]);
  if (valid.length < 5) {
    await writeAuditLogSafely({ action: "FUEL_BIAS_CALIBRATION_SKIPPED", entityType: "AircraftPerformanceProfile", entityId: aircraft.performanceProfile.id, message: `Fuel bias calibration requires 5 samples; ${valid.length} available.`, metadata: { vamsysAircraftId, sampleCount: valid.length } });
    return;
  }
  const average = valid.reduce((sum, item) => sum + item, 0) / valid.length;
  const fuelBiasPercent = Math.round(Math.max(-20, Math.min(20, average)) * 100) / 100;
  await prisma.aircraftPerformanceProfile.update({ where: { id: aircraft.performanceProfile.id }, data: { fuelBiasPercent, sampleSize: valid.length } });
  await writeAuditLogSafely({ action: "FUEL_BIAS_CALIBRATION_UPDATED", entityType: "AircraftPerformanceProfile", entityId: aircraft.performanceProfile.id, message: `Fuel bias calibrated to ${fuelBiasPercent}% from ${valid.length} samples.`, metadata: { vamsysAircraftId, sampleCount: valid.length, fuelBiasPercent } });
}

export async function createOrUpdateFlightAnalysis(pirepId: string) {
  const pirep = await prisma.pirep.findUnique({ where: { id: pirepId }, include: { flightDispatch: { include: { ofpBriefing: true } }, flightAnalysisReport: true } });
  if (!pirep || pirep.status !== "accepted") return null;
  const ofp = pirep.flightDispatch?.ofpBriefing?.status === "SIGNED" ? pirep.flightDispatch.ofpBriefing : null;
  const planned = plannedValues(ofp?.ofpSnapshot);
  const actualBlockMinutes = pirep.blockTimeMinutes;
  const actualFlightMinutes = pirep.flightTimeMinutes;
  const actualFuelUsedKg = pirep.fuelUsed;
  const plannedTripFuelKg = planned.tripFuelKg === null ? null : Math.round(planned.tripFuelKg);
  const fuelDiffKg = difference(actualFuelUsedKg, plannedTripFuelKg);
  const fuelDiffPercent = differencePercent(actualFuelUsedKg, plannedTripFuelKg);
  const blockTimeDiffMinutes = difference(actualBlockMinutes, planned.blockMinutes);
  const flightTimeDiffMinutes = difference(actualFlightMinutes, planned.flightMinutes);
  const landingG = numericValue(deepValue(pirep.rawData, ["landing_g", "landingg", "g_force", "gforce"]));
  const plannedDistanceNm = planned.distanceNm === null ? null : Math.round(planned.distanceNm);
  const distanceDiffNm = difference(pirep.flightDistanceNm, plannedDistanceNm);
  const score = efficiencyScore({ fuelDiffPercent, blockTimeDiffMinutes, landingRate: pirep.landingRate });
  const summary = { efficiencyScore: score, plannedDistanceNm, distanceDiffNm, hasSignedOfp: Boolean(ofp), landingSummary: { rateFpm: pirep.landingRate, gForce: landingG }, interpretation: fuelDiffPercent === null ? "Fuel comparison unavailable." : fuelDiffPercent > 5 ? "Actual fuel burn exceeded plan." : fuelDiffPercent < -5 ? "Actual fuel burn was materially below plan." : "Actual fuel burn was close to plan." } as Prisma.InputJsonValue;
  const data = { ofpBriefingId: ofp?.id ?? null, plannedBlockMinutes: planned.blockMinutes, actualBlockMinutes, blockTimeDiffMinutes, plannedFlightMinutes: planned.flightMinutes, actualFlightMinutes, flightTimeDiffMinutes, plannedTripFuelKg, actualFuelUsedKg, fuelDiffKg, fuelDiffPercent, plannedRoute: planned.route, actualDistanceNm: pirep.flightDistanceNm, landingRate: pirep.landingRate, landingG, summary };
  const created = !pirep.flightAnalysisReport;
  const report = await prisma.flightAnalysisReport.upsert({ where: { pirepId }, create: { pirepId, ...data }, update: data });
  if (created) await writeAuditLogSafely({ action: "FLIGHT_ANALYSIS_CREATED", entityType: "FlightAnalysisReport", entityId: report.id, message: "Post-flight planned versus actual analysis created.", metadata: { pirepId, ofpBriefingId: ofp?.id ?? null, efficiencyScore: score } });
  await calibrateFuelBias(pirep.vamsysAircraftId, report.id);
  return report;
}

