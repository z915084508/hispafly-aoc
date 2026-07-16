import type { FuelPolicyProfile, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLogSafely } from "@/lib/audit/log";
import { baseFuelDiscountPercent } from "@/lib/dispatch/loadFactor";
import { latestFuelPrice, regionFromIcao } from "@/lib/economy/fuel";
import { calculateTankeringRecommendation } from "./tankering";

export interface AppliedFuelPolicy {
  profileId: string;
  name: string;
  routeType: string;
  contingencyRule: string;
  finalReserveRule: string;
  taxiFuelKg: number | null;
  minFobKg: number | null;
  minArrivalFuelKg: number | null;
  atcFuelMinutes: number | null;
  weatherFuelMinutes: number | null;
  melFuelKg: number | null;
  extraFuelKg: number | null;
  addedFuelLabel: string | null;
  tankeringAllowed: boolean;
  tankering: null | { recommendedKg: number; estimatedSavingCents: number; priceDifferencePerKgCents: number; departurePricePerKgCents: number; arrivalPricePerKgCents: number; };
  calculationDetails: Record<string, unknown>;
}

function aircraftCategory(type: string | null) {
  const code = type?.toUpperCase() ?? "";
  return /^(A33|A34|A35|A38|B74|B76|B77|B78)/.test(code) ? "WIDEBODY" : "NARROWBODY";
}

function scorePolicy(profile: FuelPolicyProfile, routeType: string, region: string, category: string) {
  if (profile.routeType && profile.routeType !== routeType) return -1;
  if (profile.region && profile.region !== region) return -1;
  if (profile.aircraftCategory && profile.aircraftCategory !== category) return -1;
  return (profile.routeType ? 4 : 0) + (profile.region ? 2 : 0) + (profile.aircraftCategory ? 8 : 0);
}

export async function resolveFuelPolicy(input: { estimatedDurationMinutes: number; departureIcao: string; aircraftType: string | null }) {
  const routeType = input.estimatedDurationMinutes >= 360 ? "LONG_HAUL" : "SHORT_HAUL";
  const region = regionFromIcao(input.departureIcao);
  const category = aircraftCategory(input.aircraftType);
  const profiles = await prisma.fuelPolicyProfile.findMany({ where: { active: true }, orderBy: { updatedAt: "desc" } });
  const ranked = profiles.map((profile) => ({ profile, score: scorePolicy(profile, routeType, region, category) })).filter((item) => item.score >= 0).sort((a, b) => b.score - a.score);
  if (!ranked[0]) throw new Error(`No active fuel policy is configured for ${routeType} / ${region}.`);
  return { profile: ranked[0].profile, routeType, region, category };
}

export async function buildAppliedFuelPolicy(input: {
  pilotId: string;
  ofpBriefingId: string;
  aircraftId?: string | null;
  vamsysAircraftId?: string | null;
  aircraftType: string | null;
  departureIcao: string;
  arrivalIcao: string;
  estimatedDurationMinutes: number;
  passengers: number | null;
  freightKg: number | null;
}) {
  const [{ profile, routeType, region, category }, aircraft, condition, departurePrice, arrivalPrice] = await Promise.all([
    resolveFuelPolicy(input),
    input.aircraftId
      ? prisma.aircraft.findUnique({ where: { id: input.aircraftId }, include: { performanceProfile: true } })
      : input.vamsysAircraftId
        ? prisma.aircraft.findUnique({ where: { vamsysAircraftId: input.vamsysAircraftId }, include: { performanceProfile: true } })
        : null,
    input.aircraftId
      ? prisma.aircraftConditionSnapshot.findUnique({ where: { aircraftId: input.aircraftId } })
      : input.vamsysAircraftId
        ? prisma.aircraftConditionSnapshot.findUnique({ where: { vamsysAircraftId: input.vamsysAircraftId } })
        : null,
    latestFuelPrice(regionFromIcao(input.departureIcao)),
    latestFuelPrice(regionFromIcao(input.arrivalIcao)),
  ]);
  const maintenanceFuelRequired = condition ? Number(condition.conditionPercent) < 40 : false;
  const melFuelKg = maintenanceFuelRequired ? Math.max(profile.melFuelKg ?? 0, 500) : profile.melFuelKg;
  const extraFuelKg = maintenanceFuelRequired ? Math.max(profile.extraFuelKg ?? 0, 500) : profile.extraFuelKg;
  let tankering: AppliedFuelPolicy["tankering"] = null;
  let skipReason = profile.tankeringAllowed ? "Required price, fuel capacity or weight data is unavailable." : "Tankering is disabled by the selected policy.";
  const performance = aircraft?.performanceProfile;
  if (profile.tankeringAllowed && departurePrice && arrivalPrice && aircraft && performance?.maxFuelKg && performance.operatingEmptyWeightKg && performance.maxTakeoffWeightKg && performance.maxLandingWeightKg) {
    const departureEffective = departurePrice.pricePerKgCents * (1 - baseFuelDiscountPercent(input.departureIcao) / 100);
    const arrivalEffective = arrivalPrice.pricePerKgCents * (1 - baseFuelDiscountPercent(input.arrivalIcao) / 100);
    const currentFuelKg = aircraft.fuelOnBoardKg ?? 0;
    const estimatedZeroFuelWeightKg = performance.operatingEmptyWeightKg + (input.passengers ?? 0) * 100 + (input.freightKg ?? 0);
    const recommendation = calculateTankeringRecommendation({
      departurePricePerKgCents: departureEffective,
      arrivalPricePerKgCents: arrivalEffective,
      fuelCapacityMarginKg: performance.maxFuelKg - currentFuelKg,
      takeoffWeightMarginKg: performance.maxTakeoffWeightKg - estimatedZeroFuelWeightKg - currentFuelKg,
      landingWeightMarginKg: performance.maxLandingWeightKg - estimatedZeroFuelWeightKg - currentFuelKg,
    });
    if (recommendation) tankering = { ...recommendation, departurePricePerKgCents: departureEffective, arrivalPricePerKgCents: arrivalEffective };
    else skipReason = arrivalEffective <= departureEffective ? "Arrival fuel is not more expensive than departure fuel." : "Aircraft fuel or weight margin is insufficient.";
  }
  const applied: AppliedFuelPolicy = {
    profileId: profile.id, name: profile.name, routeType,
    contingencyRule: profile.contingencyRule, finalReserveRule: profile.finalReserveRule,
    taxiFuelKg: profile.taxiFuelKg, minFobKg: profile.minFobKg, minArrivalFuelKg: profile.minArrivalFuelKg,
    atcFuelMinutes: profile.atcFuelMinutes, weatherFuelMinutes: 0,
    melFuelKg, extraFuelKg, addedFuelLabel: maintenanceFuelRequired ? "OPN" : extraFuelKg ? "OPN" : null,
    tankeringAllowed: profile.tankeringAllowed, tankering,
    calculationDetails: { region, aircraftCategory: category, aircraftConditionPercent: condition ? Number(condition.conditionPercent) : null, maintenanceFuelRequired, configuredBadWeatherFuelMinutes: profile.weatherFuelMinutes, badWeatherDetected: false, departureFuelPriceId: departurePrice?.id ?? null, arrivalFuelPriceId: arrivalPrice?.id ?? null, tankeringSkipReason: tankering ? null : skipReason },
  };
  await writeAuditLogSafely({ action: "FUEL_POLICY_APPLIED", entityType: "OfpBriefing", entityId: input.ofpBriefingId, message: `Fuel policy ${profile.name} applied.`, metadata: { pilotId: input.pilotId, profileId: profile.id, routeType, maintenanceFuelRequired } });
  if (tankering) {
    await writeAuditLogSafely({ action: "TANKERING_RECOMMENDED", entityType: "OfpBriefing", entityId: input.ofpBriefingId, message: `Tankering ${tankering.recommendedKg} kg recommended.`, metadata: { pilotId: input.pilotId, ...tankering } });
  } else {
    await writeAuditLogSafely({ action: "TANKERING_SKIPPED", entityType: "OfpBriefing", entityId: input.ofpBriefingId, message: skipReason, metadata: { pilotId: input.pilotId, profileId: profile.id } });
  }
  return applied;
}

function simBriefContingencyPercent(value: string) {
  const first = value.trim().split("/")[0]?.trim();
  const numeric = Number(first);
  if (!Number.isFinite(numeric) || numeric <= 0) return value;
  return numeric < 1 ? Math.round(numeric * 100) : numeric;
}

export function fuelPolicyPayload(policy: AppliedFuelPolicy): Record<string, string | number | undefined> {
  return {
    contpct: simBriefContingencyPercent(policy.contingencyRule),
    resvrule: policy.finalReserveRule,
    taxifuel: policy.taxiFuelKg ?? undefined,
    minfob: policy.minFobKg ?? undefined,
    minfob_units: policy.minFobKg ? "wgt" : undefined,
    minfod: policy.minArrivalFuelKg ?? undefined,
    minfod_units: policy.minArrivalFuelKg ? "wgt" : undefined,
    melfuel: policy.melFuelKg ?? undefined,
    melfuel_units: policy.melFuelKg ? "wgt" : undefined,
    atcfuel: policy.atcFuelMinutes ?? undefined,
    atcfuel_units: policy.atcFuelMinutes ? "min" : undefined,
    wxxfuel: policy.weatherFuelMinutes ?? undefined,
    wxxfuel_units: policy.weatherFuelMinutes ? "min" : undefined,
    addedfuel: policy.extraFuelKg ?? undefined,
    addedfuel_label: policy.addedFuelLabel?.toLowerCase() ?? undefined,
    addedfuel_units: policy.extraFuelKg ? "wgt" : undefined,
    tankering: policy.tankering?.recommendedKg ?? 0,
    tankering_units: policy.tankering ? "wgt" : undefined,
    etops: policy.routeType === "LONG_HAUL" ? 1 : 0,
  };
}

export const fuelPolicyJson = (policy: AppliedFuelPolicy) => policy as unknown as Prisma.InputJsonValue;
