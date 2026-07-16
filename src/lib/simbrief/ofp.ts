import { createHash } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeFlightIdentity } from "@/lib/dispatch/flightIdentity";
import { extractSimbriefPdfUrl } from "@/lib/simbrief/pdf";
import { normalizeSimbriefUserId } from "@/lib/simbrief/userId";
import { generateSimBriefFlightplan } from "@/lib/simbrief/client";
import { assertAircraftDispatchAllowed } from "@/lib/aircraft-maintenance/service";
import { writeAuditLogSafely } from "@/lib/audit/log";
import { extractSimbriefOfpUrl, simbriefResponseUserId } from "@/lib/simbrief/response";
import { buildSimBriefGeneratePayload } from "@/lib/simbrief/payload";
import { evaluateDispatchRelease } from "@/lib/dispatch-release/service";
import { normalizeAlternateIcao } from "@/lib/dispatch-release/alternatePolicy";
import { buildAppliedFuelPolicy, fuelPolicyJson, fuelPolicyPayload } from "@/lib/fuel-policy/service";

export function ofpContentHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function simbriefDispatchUrl(input: {
  staticId: string; airline?: string | null; flightNumber?: string | null; callsign?: string | null; simbriefUserId?: string | null; aircraftType?: string | null;
  registration?: string | null; departure: string; arrival: string; passengers?: number | null;
  luggageKg?: number | null; altitude?: number | null; route?: string | null; costIndex?: number | null;
  fuelBiasPercent?: number | null; aircraftData?: Record<string, string | number | null> | null;
}) {
  const identity = normalizeFlightIdentity({ flightNumber: input.flightNumber, callsign: input.callsign, airlineName: input.airline ?? "HISPAFLY" });
  const query = new URLSearchParams({ orig: input.departure, dest: input.arrival, type: input.aircraftType ?? "A320", units: "KGS", static_id: input.staticId, airline: identity.airlineName });
  if (identity.numericFlightNumber) query.set("fltnum", identity.numericFlightNumber);
  if (identity.atcCallsign) query.set("callsign", identity.atcCallsign);
  if (identity.commercialFlightNumber) query.set("flight_number", identity.commercialFlightNumber);
  if (input.simbriefUserId) query.set("userid", input.simbriefUserId);
  if (input.registration) query.set("reg", input.registration);
  if (input.passengers !== null && input.passengers !== undefined) query.set("pax", String(input.passengers));
  if (input.luggageKg !== null && input.luggageKg !== undefined) query.set("cargo", String(input.luggageKg / 1000));
  if (input.altitude) query.set("fl", String(input.altitude));
  if (input.route) query.set("route", input.route);
  if (input.costIndex !== null && input.costIndex !== undefined) query.set("civalue", String(input.costIndex));
  if (input.fuelBiasPercent) query.set("fuelfactor", `${input.fuelBiasPercent > 0 ? "P" : "M"}${String(Math.abs(Math.round(input.fuelBiasPercent))).padStart(2, "0")}`);
  if (input.aircraftData) query.set("acdata", JSON.stringify(input.aircraftData));
  return `https://www.simbrief.com/system/dispatch.php?${query}`;
}

export async function createDispatchOfpBriefing(dispatchId: string) {
  const dispatch = await prisma.flightDispatch.findUnique({
    where: { id: dispatchId },
    include: { flightOffer: true, pilot: true, aircraft: { include: { performanceProfile: true } } },
  });
  if (!dispatch) throw new Error("Dispatch not found.");
  const aircraft = dispatch.aircraft ?? (dispatch.flightOffer.vamsysAircraftId ? await prisma.aircraft.findUnique({ where: { vamsysAircraftId: dispatch.flightOffer.vamsysAircraftId }, include: { performanceProfile: true } }) : null);
  const performance = aircraft?.performanceProfile;
  const identity = normalizeFlightIdentity({ flightNumber: dispatch.flightOffer.flightNumber, callsign: dispatch.flightOffer.callsign });
  const staticId = `HISPAFLY_${dispatch.id.replace(/[^a-zA-Z0-9]/g, "_")}`;
  const snapshot = {
    dispatchId: dispatch.id, bookingId: dispatch.vamsysBookingId, route: `${dispatch.flightOffer.departureIcao}-${dispatch.flightOffer.arrivalIcao}`,
    flightNumber: identity.commercialFlightNumber, callsign: identity.atcCallsign, airlineName: identity.airlineName, aircraft: dispatch.flightOffer.aircraftRegistration ?? dispatch.flightOffer.aircraftType,
    passengers: dispatch.flightOffer.passengers, loadFactorPercent: dispatch.flightOffer.loadFactorPercent,
    luggageKg: dispatch.flightOffer.luggageKg, freightKg: dispatch.flightOffer.freightKg,
    selectedDepartureAt: dispatch.selectedDepartureAt?.toISOString(), version: 1,
  };
  // SimBrief acdata weights are expressed in thousands of pounds, even when
  // the OFP itself uses KGS. 1,000 lb = 453.59237 kg.
  const thousandPounds = (kg: number | null | undefined) => kg == null ? null : Math.round((kg / 453.59237) * 1000) / 1000;
  const ofpUrl = simbriefDispatchUrl({ staticId, airline: identity.airlineName, flightNumber: identity.commercialFlightNumber, callsign: identity.atcCallsign, simbriefUserId: dispatch.pilot.simbriefUserId, aircraftType: dispatch.flightOffer.aircraftType, registration: dispatch.flightOffer.aircraftRegistration, departure: dispatch.flightOffer.departureIcao, arrival: dispatch.flightOffer.arrivalIcao, passengers: dispatch.flightOffer.passengers, luggageKg: dispatch.flightOffer.luggageKg, altitude: dispatch.flightOffer.altitude, route: dispatch.flightOffer.userRoute, costIndex: performance?.defaultCostIndex, fuelBiasPercent: performance?.fuelBiasPercent, aircraftData: performance ? { maxpax: aircraft?.seatCapacity ?? null, oew: thousandPounds(performance.operatingEmptyWeightKg), mzfw: thousandPounds(performance.maxZeroFuelWeightKg), mtow: thousandPounds(performance.maxTakeoffWeightKg), mlw: thousandPounds(performance.maxLandingWeightKg), maxfuel: thousandPounds(performance.maxFuelKg) } : null });
  return prisma.ofpBriefing.upsert({
    where: { flightDispatchId: dispatch.id },
    create: { flightDispatchId: dispatch.id, status: "GENERATED", simbriefStaticId: staticId, simbriefUserId: dispatch.pilot.simbriefUserId, ofpUrl, ofpSnapshot: snapshot, contentHash: ofpContentHash(snapshot) },
    update: {},
  });
}

export async function importSimbriefOfp(ofpId: string, pilotId: string, simbriefUserId: string) {
  const normalizedUserId = normalizeSimbriefUserId(simbriefUserId);
  if (!normalizedUserId) throw new Error("SimBrief Pilot ID is required.");
  const ofp = await prisma.ofpBriefing.findFirst({ where: { id: ofpId, flightDispatch: { pilotId } } });
  if (!ofp) throw new Error("You do not have access to this OFP.");
  const response = await fetch(`https://www.simbrief.com/api/xml.fetcher.php?userid=${encodeURIComponent(normalizedUserId)}&static_id=${encodeURIComponent(ofp.simbriefStaticId)}&json=1`, { cache: "no-store" });
  if (!response.ok) throw new Error(`SimBrief returned ${response.status}. Generate the OFP first.`);
  const snapshot = await response.json() as Prisma.InputJsonValue;
  const pdfUrl = extractSimbriefPdfUrl(snapshot);
  return prisma.ofpBriefing.update({ where: { id: ofp.id }, data: { status: "AWAITING_SIGNATURE", simbriefUserId: normalizedUserId, ofpSnapshot: snapshot, contentHash: ofpContentHash(snapshot), pdfUrl, signatureData: null, signedAt: null, signedByPilotId: null } });
}

export async function generateDispatchSimBriefOfp(input: { ofpId: string; pilotId: string; staffUserId?: string | null; alternateIcao?: string | null }) {
  const ofp = await prisma.ofpBriefing.findFirst({
    where: { id: input.ofpId, flightDispatch: { pilotId: input.pilotId } },
    include: { flightDispatch: { include: { flightOffer: true, pilot: true, aircraft: { include: { conditionSnapshot: true } } } } },
  });
  if (!ofp) throw new Error("OFP not found or is not assigned to this pilot.");
  if (ofp.status === "VOIDED") throw new Error("This OFP can no longer be regenerated.");
  const dispatch = ofp.flightDispatch, offer = dispatch.flightOffer;
  if (!["DISPATCHING", "DRAFT", "PREPARING", "CHECK_REQUIRED", "READY_FOR_RELEASE"].includes(dispatch.status)) throw new Error("This OFP can only be regenerated before Final Dispatch.");
  if (!dispatch.selectedDepartureAt) throw new Error("The selected departure time is missing.");
  if (dispatch.dataOrigin === "HISPAFLY_NATIVE" && dispatch.aircraft) {
    if (["AOG", "IN_MAINTENANCE"].includes(dispatch.aircraft.conditionSnapshot?.operationalStatus ?? "")) throw new Error("Aircraft is AOG or in maintenance.");
  } else {
    if (!offer.vamsysAircraftId) throw new Error("Legacy aircraft identity is missing.");
    await assertAircraftDispatchAllowed({ vamsysAircraftId: offer.vamsysAircraftId, offerType: offer.offerType, arrivalIcao: offer.arrivalIcao });
  }
  const alternateIcao = normalizeAlternateIcao(input.alternateIcao);
  const staticId = `HFAOC-${dispatch.id.replace(/[^A-Za-z0-9-]/g, "-")}`;
  const basePayload = buildSimBriefGeneratePayload({
    staticId,
    departureIcao: offer.departureIcao,
    arrivalIcao: offer.arrivalIcao,
    aircraftType: offer.aircraftType,
    flightNumber: offer.flightNumber,
    callsign: offer.callsign,
    aircraftRegistration: offer.aircraftRegistration,
    selectedDepartureAt: dispatch.selectedDepartureAt,
    passengers: offer.passengers,
    freightKg: offer.freightKg,
    cargoKg: offer.cargoKg,
    userRoute: offer.userRoute,
    altitude: offer.altitude,
    alternateIcao,
  });
  await writeAuditLogSafely({ staffUserId: input.staffUserId, action: "OFP_GENERATION_REQUESTED_BY_USER", entityType: "OfpBriefing", entityId: ofp.id, message: "A user requested SimBrief OFP generation.", metadata: { pilotId: input.pilotId, dispatchId: dispatch.id, requestedBy: input.staffUserId ? "STAFF" : "PILOT", alternateIcao } });
  try {
    const fuelPolicy = await buildAppliedFuelPolicy({
      pilotId: input.pilotId,
      ofpBriefingId: ofp.id,
      aircraftId: dispatch.aircraft?.id,
      vamsysAircraftId: dispatch.aircraft?.vamsysAircraftId ?? offer.vamsysAircraftId,
      aircraftType: offer.aircraftType,
      departureIcao: offer.departureIcao,
      arrivalIcao: offer.arrivalIcao,
      estimatedDurationMinutes: offer.estimatedDurationMinutes,
      passengers: offer.passengers,
      freightKg: offer.freightKg,
    });
    const payload = { ...basePayload, ...fuelPolicyPayload(fuelPolicy) };
    const response = await generateSimBriefFlightplan(input.pilotId, payload);
    const snapshot = response as Prisma.InputJsonValue;
    const pdfUrl = extractSimbriefPdfUrl(response);
    const ofpUrl = extractSimbriefOfpUrl(response);
    const saved = await prisma.ofpBriefing.update({ where: { id: ofp.id }, data: {
      status: "AWAITING_SIGNATURE",
      simbriefStaticId: staticId,
      simbriefUserId: simbriefResponseUserId(response) ?? dispatch.pilot.simbriefUserId,
      ofpUrl,
      pdfUrl,
      ofpSnapshot: snapshot,
      fuelPolicyProfileId: fuelPolicy.profileId,
      fuelPolicySnapshot: fuelPolicyJson(fuelPolicy),
      tankeringRecommendation: fuelPolicy.tankering ? fuelPolicy.tankering as unknown as Prisma.InputJsonValue : Prisma.DbNull,
      tankeringApplied: Boolean(fuelPolicy.tankering),
      contentHash: ofpContentHash({ response, fuelPolicy, alternateIcao }),
      signatureData: null,
      signedAt: null,
      signedByPilotId: null,
      signedByName: null,
      signedByCallsign: null,
    } });
    if (fuelPolicy.tankering) await writeAuditLogSafely({ staffUserId: input.staffUserId, action: "TANKERING_APPLIED", entityType: "OfpBriefing", entityId: ofp.id, message: "Tankering recommendation applied to the generated SimBrief OFP.", metadata: { pilotId: input.pilotId, recommendedKg: fuelPolicy.tankering.recommendedKg, estimatedSavingCents: fuelPolicy.tankering.estimatedSavingCents } });
    await writeAuditLogSafely({ staffUserId: input.staffUserId, action: alternateIcao ? "SIMBRIEF_OFP_GENERATED_WITH_ALTERNATE" : "SIMBRIEF_OFP_GENERATED", entityType: "OfpBriefing", entityId: ofp.id, message: "SimBrief OFP generated and saved to AOC.", metadata: { pilotId: input.pilotId, dispatchId: dispatch.id, staticId, hasPdf: Boolean(pdfUrl), hasOfpUrl: Boolean(ofpUrl), alternateIcao } });
    await evaluateDispatchRelease({ ofpBriefingId: ofp.id });
    return saved;
  } catch (error) {
    const message = error instanceof Error ? error.message : "SimBrief OFP generation failed.";
    await writeAuditLogSafely({ staffUserId: input.staffUserId, action: "SIMBRIEF_OFP_GENERATION_FAILED", entityType: "OfpBriefing", entityId: ofp.id, message, metadata: { pilotId: input.pilotId, dispatchId: dispatch.id, staticId, alternateIcao } });
    throw error;
  }
}
