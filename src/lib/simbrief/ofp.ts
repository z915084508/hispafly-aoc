import { createHash } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeFlightIdentity } from "@/lib/dispatch/flightIdentity";
import { extractSimbriefPdfUrl } from "@/lib/simbrief/pdf";

export function ofpContentHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function simbriefDispatchUrl(input: {
  staticId: string; airline?: string | null; flightNumber?: string | null; callsign?: string | null; aircraftType?: string | null;
  registration?: string | null; departure: string; arrival: string; passengers?: number | null;
  luggageKg?: number | null; altitude?: number | null; route?: string | null; costIndex?: number | null;
  fuelBiasPercent?: number | null; aircraftData?: Record<string, string | number | null> | null;
}) {
  const identity = normalizeFlightIdentity({ flightNumber: input.flightNumber, callsign: input.callsign, airlineName: input.airline ?? "HISPAFLY" });
  const query = new URLSearchParams({ orig: input.departure, dest: input.arrival, type: input.aircraftType ?? "A320", units: "KGS", static_id: input.staticId, airline: identity.airlineName });
  if (identity.numericFlightNumber) query.set("fltnum", identity.numericFlightNumber);
  if (identity.atcCallsign) query.set("callsign", identity.atcCallsign);
  if (identity.commercialFlightNumber) query.set("flight_number", identity.commercialFlightNumber);
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
  const dispatch = await prisma.flightDispatch.findUnique({ where: { id: dispatchId }, include: { flightOffer: true, pilot: true } });
  if (!dispatch) throw new Error("Dispatch not found.");
  const aircraft = await prisma.aircraft.findUnique({ where: { vamsysAircraftId: dispatch.flightOffer.vamsysAircraftId }, include: { performanceProfile: true } });
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
  const ofpUrl = simbriefDispatchUrl({ staticId, airline: identity.airlineName, flightNumber: identity.commercialFlightNumber, callsign: identity.atcCallsign, aircraftType: dispatch.flightOffer.aircraftType, registration: dispatch.flightOffer.aircraftRegistration, departure: dispatch.flightOffer.departureIcao, arrival: dispatch.flightOffer.arrivalIcao, passengers: dispatch.flightOffer.passengers, luggageKg: dispatch.flightOffer.luggageKg, altitude: dispatch.flightOffer.altitude, route: dispatch.flightOffer.userRoute, costIndex: performance?.defaultCostIndex, fuelBiasPercent: performance?.fuelBiasPercent, aircraftData: performance ? { maxpax: aircraft?.seatCapacity ?? null, oew: thousandPounds(performance.operatingEmptyWeightKg), mzfw: thousandPounds(performance.maxZeroFuelWeightKg), mtow: thousandPounds(performance.maxTakeoffWeightKg), mlw: thousandPounds(performance.maxLandingWeightKg), maxfuel: thousandPounds(performance.maxFuelKg) } : null });
  return prisma.ofpBriefing.upsert({
    where: { flightDispatchId: dispatch.id },
    create: { flightDispatchId: dispatch.id, status: "GENERATED", simbriefStaticId: staticId, simbriefUserId: dispatch.pilot.simbriefUserId, ofpUrl, ofpSnapshot: snapshot, contentHash: ofpContentHash(snapshot) },
    update: {},
  });
}

export async function importSimbriefOfp(ofpId: string, pilotId: string, simbriefUserId: string) {
  const ofp = await prisma.ofpBriefing.findFirst({ where: { id: ofpId, flightDispatch: { pilotId } } });
  if (!ofp) throw new Error("You do not have access to this OFP.");
  const response = await fetch(`https://www.simbrief.com/api/xml.fetcher.php?userid=${encodeURIComponent(simbriefUserId)}&static_id=${encodeURIComponent(ofp.simbriefStaticId)}&json=1`, { cache: "no-store" });
  if (!response.ok) throw new Error(`SimBrief returned ${response.status}. Generate the OFP first.`);
  const snapshot = await response.json() as Prisma.InputJsonValue;
  const pdfUrl = extractSimbriefPdfUrl(snapshot);
  await prisma.pilot.update({ where: { id: pilotId }, data: { simbriefUserId } });
  return prisma.ofpBriefing.update({ where: { id: ofp.id }, data: { status: "AWAITING_SIGNATURE", simbriefUserId, ofpSnapshot: snapshot, contentHash: ofpContentHash(snapshot), pdfUrl, signatureData: null, signedAt: null, signedByPilotId: null } });
}
