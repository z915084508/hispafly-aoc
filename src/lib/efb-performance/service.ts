import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLogSafely } from "@/lib/audit/log";
import { normalizeFlightIdentity } from "@/lib/dispatch/flightIdentity";
import { calculateLandingPerformance, calculateTakeoffPerformance } from "@/lib/simbrief/client";
import { summarizeSimbriefOfp } from "@/lib/simbrief/response";
import { numericValue } from "@/lib/flight-analysis/calculations";
import { EfbApiError } from "./http";

type JsonRow = Record<string, unknown>;
type PerformanceType = "TAKEOFF" | "LANDING";
type PerformanceMode = "OFFICIAL" | "MANUAL";
const record = (value: unknown): JsonRow | null => value && typeof value === "object" && !Array.isArray(value) ? value as JsonRow : null;

function deepValues(root: unknown, keys: string[]) {
  const found: unknown[] = [], queue: unknown[] = [root];
  while (queue.length) { const value = queue.shift(); if (!value || typeof value !== "object") continue; for (const [key, child] of Object.entries(value as JsonRow)) { if (keys.includes(key.toLowerCase())) found.push(child); if (child && typeof child === "object") queue.push(child); } }
  return found;
}
function firstText(root: unknown, keys: string[]) { for (const value of deepValues(root, keys)) if ((typeof value === "string" || typeof value === "number") && String(value).trim()) return String(value).trim(); return null; }
function firstNumber(root: unknown, keys: string[]) { for (const value of deepValues(root, keys)) { const number = numericValue(value); if (number !== null) return number; } return null; }
function stringArray(value: unknown) { if (Array.isArray(value)) return value.flatMap((item) => typeof item === "string" ? [item] : []); return typeof value === "string" && value.trim() ? [value.trim()] : []; }
function cleanText(value: unknown, max = 32) { const text = typeof value === "string" ? value.trim() : ""; return text ? text.slice(0, max) : null; }
function requiredText(value: unknown, name: string, pattern?: RegExp) { const text = cleanText(value, 32)?.toUpperCase(); if (!text || (pattern && !pattern.test(text))) throw new EfbApiError(400, "INVALID_INPUT", `${name} is invalid.`); return text; }
function optionalNumber(value: unknown, min: number, max: number) { if (value === null || value === undefined || value === "") return null; const number = Number(value); if (!Number.isFinite(number) || number < min || number > max) throw new EfbApiError(400, "INVALID_INPUT", "A numeric performance input is invalid."); return number; }
const boolParam = (value: unknown, fallback: boolean) => value === undefined || value === null ? (fallback ? 1 : 0) : value === true || value === 1 || value === "1" ? 1 : 0;

function calculationStatus(result: unknown) {
  const explicit = firstText(result, ["status", "calculation_status"])?.toUpperCase();
  const message = firstText(result, ["error", "error_message", "message"]);
  const warnings = [...stringArray(record(result)?.warnings), ...deepValues(result, ["warning", "warnings"]).flatMap(stringArray)];
  if (explicit && ["FAILED", "ERROR", "NOT_SUPPORTED"].includes(explicit)) return { status: explicit, warnings, message };
  if (message && /not.?supported|unsupported/i.test(message)) return { status: "NOT_SUPPORTED", warnings, message };
  if (record(result)?.success === false || record(result)?.valid === false) return { status: "FAILED", warnings, message };
  return { status: warnings.length ? "WARNING" : "OK", warnings: [...new Set(warnings)], message };
}

function performanceSummary(type: PerformanceType, result: unknown) {
  return type === "TAKEOFF" ? {
    flaps: firstText(result, ["flaps", "flap_setting"]), thrust: firstText(result, ["thrust", "thrust_setting"]), flexTemp: firstText(result, ["flex_temp", "flex_temperature"]),
    v1: firstNumber(result, ["v1"]), vr: firstNumber(result, ["vr"]), v2: firstNumber(result, ["v2"]), maxWeightKg: firstNumber(result, ["max_weight", "max_takeoff_weight", "mtow"]), marginKg: firstNumber(result, ["margin_kg", "weight_margin"]),
  } : {
    flaps: firstText(result, ["flaps", "flap_setting"]), brake: firstText(result, ["brake", "brake_setting"]), requiredDistanceM: firstNumber(result, ["required_distance", "landing_distance_required", "ldr"]), availableDistanceM: firstNumber(result, ["available_distance", "lda"]), marginM: firstNumber(result, ["margin", "distance_margin"]), maxLandingWeightKg: firstNumber(result, ["max_landing_weight", "mlw"]),
  };
}

async function officialFlight(pilotId: string, flightDispatchId: string | null, ofpBriefingId: string | null) {
  if (!flightDispatchId) throw new EfbApiError(400, "OFFICIAL_FLIGHT_REQUIRED", "Official mode requires a dispatched flight.");
  const dispatch = await prisma.flightDispatch.findFirst({ where: { id: flightDispatchId, pilotId, status: "DISPATCHED", vamsysBookingId: { not: null }, completedAt: null, cancelledAt: null, ofpBriefing: { ...(ofpBriefingId ? { id: ofpBriefingId } : {}), status: "SIGNED" } }, include: { flightOffer: true, ofpBriefing: true } });
  if (!dispatch?.ofpBriefing || !dispatch.vamsysBookingId) throw new EfbApiError(403, "OFFICIAL_FLIGHT_NOT_AVAILABLE", "The official flight is not signed and final-dispatched.");
  return dispatch;
}

export async function getActivePerformanceFlight(pilotId: string) {
  const dispatch = await prisma.flightDispatch.findFirst({ where: { pilotId, status: "DISPATCHED", vamsysBookingId: { not: null }, completedAt: null, cancelledAt: null, ofpBriefing: { status: "SIGNED" } }, include: { flightOffer: true, ofpBriefing: true }, orderBy: { dispatchedAt: "desc" } });
  if (!dispatch?.ofpBriefing || !dispatch.vamsysBookingId) return { active: false, mode: "MANUAL" };
  const identity = normalizeFlightIdentity({ flightNumber: dispatch.flightOffer.flightNumber, callsign: dispatch.flightOffer.callsign });
  const summary = summarizeSimbriefOfp(dispatch.ofpBriefing.ofpSnapshot);
  const readiness = await prisma.efbDepartureReadiness.findUnique({ where: { flightDispatchId: dispatch.id } });
  return { active: true, mode: "OFFICIAL", phase: "POST_DISPATCH", flightDispatchId: dispatch.id, ofpBriefingId: dispatch.ofpBriefing.id, vamsysBookingId: dispatch.vamsysBookingId, flightNumber: identity.commercialFlightNumber, callsign: identity.atcCallsign, departureIcao: dispatch.flightOffer.departureIcao, arrivalIcao: dispatch.flightOffer.arrivalIcao, aircraftType: dispatch.flightOffer.aircraftType, aircraftRegistration: dispatch.flightOffer.aircraftRegistration, takeoffWeightKg: numericValue(summary.tow), landingWeightKg: numericValue(summary.landingWeight), plannedDepartureRunway: null, plannedArrivalRunway: null, ofpStatus: dispatch.ofpBriefing.status, dispatchStatus: dispatch.status, readyForDepartureStatus: readiness?.status ?? "PENDING" };
}

export async function runPerformanceCalculation(pilotId: string, type: PerformanceType, body: JsonRow) {
  const mode = String(body.mode ?? "MANUAL").toUpperCase() as PerformanceMode;
  if (!(["OFFICIAL", "MANUAL"] as string[]).includes(mode)) throw new EfbApiError(400, "INVALID_MODE", "Performance mode must be OFFICIAL or MANUAL.");
  const airportIcao = requiredText(body.airport, "airport", /^[A-Z0-9]{4}$/), runway = cleanText(body.runway), aircraftType = requiredText(body.aircraft, "aircraft", /^[A-Z0-9-]{2,12}$/), aircraftRegistration = cleanText(body.aircraftRegistration), weightKg = optionalNumber(body.weightKg, 1000, 700000);
  const officialDispatchId = cleanText(body.flightDispatchId, 64), officialOfpId = cleanText(body.ofpBriefingId, 64);
  if (mode === "OFFICIAL" && (!officialDispatchId || !officialOfpId)) throw new EfbApiError(400, "OFFICIAL_FLIGHT_REQUIRED", "Official mode requires flightDispatchId and ofpBriefingId.");
  const dispatch = mode === "OFFICIAL" ? await officialFlight(pilotId, officialDispatchId, officialOfpId) : null;
  if (dispatch) {
    const expectedAirport = type === "TAKEOFF" ? dispatch.flightOffer.departureIcao : dispatch.flightOffer.arrivalIcao;
    if (airportIcao !== expectedAirport) throw new EfbApiError(400, "OFFICIAL_FLIGHT_MISMATCH", `Official ${type.toLowerCase()} airport must be ${expectedAirport}.`);
    if (dispatch.flightOffer.aircraftType && aircraftType !== dispatch.flightOffer.aircraftType.toUpperCase()) throw new EfbApiError(400, "OFFICIAL_FLIGHT_MISMATCH", `Official aircraft must be ${dispatch.flightOffer.aircraftType}.`);
    if (dispatch.flightOffer.aircraftRegistration && aircraftRegistration && aircraftRegistration.toUpperCase() !== dispatch.flightOffer.aircraftRegistration.toUpperCase()) throw new EfbApiError(400, "OFFICIAL_FLIGHT_MISMATCH", `Official registration must be ${dispatch.flightOffer.aircraftRegistration}.`);
  }
  const common = { airport: airportIcao, runway: runway ?? undefined, aircraft: aircraftType, aircraft_registration: aircraftRegistration ?? undefined, weight: weightKg ?? undefined, weight_units: "kgs", length_units: "m", wind_units: "mag", pressure_units: "hpa", surface_condition: cleanText(body.surfaceCondition) ?? "dry", wind: cleanText(body.wind) ?? "000/00", temperature: optionalNumber(body.temperature, -90, 70) ?? 15, qnh: optionalNumber(body.qnh, 800, 1100) ?? 1013, runway_shorten: optionalNumber(body.runwayShorten, 0, 10000) ?? undefined, shorten_units: cleanText(body.shortenUnits) ?? (type === "TAKEOFF" ? "tora" : "lda") };
  const params = type === "TAKEOFF" ? { ...common, flap_setting: cleanText(body.flapSetting) ?? undefined, thrust_setting: cleanText(body.thrustSetting) ?? undefined, enable_flex: boolParam(body.enableFlex, true), enable_bleeds: boolParam(body.enableBleeds, true), enable_anti_ice: cleanText(body.enableAntiIce) ?? "auto", enable_climb_optimization: boolParam(body.enableClimbOptimization, true) } : { ...common, flap_setting: cleanText(body.flapSetting) ?? undefined, brake_setting: cleanText(body.brakeSetting) ?? undefined, reverser_credit: boolParam(body.reverserCredit, true), vref_additive: optionalNumber(body.vrefAdditive, 0, 30) ?? 5, calculation_method: cleanText(body.calculationMethod) ?? "inflight", margin_method: cleanText(body.marginMethod) ?? "factored" };
  const actionPrefix = `EFB_${type}_PERFORMANCE`;
  await writeAuditLogSafely({ action: `${actionPrefix}_REQUESTED`, entityType: "FlightDispatch", entityId: dispatch?.id, message: `${type} performance requested from EFB.`, metadata: { pilotId, mode, airportIcao, runway } });
  try {
    const raw = type === "TAKEOFF" ? await calculateTakeoffPerformance(pilotId, params) : await calculateLandingPerformance(pilotId, params);
    const normalized = calculationStatus(raw), summary = performanceSummary(type, raw);
    const calculation = await prisma.efbPerformanceCalculation.create({ data: { pilotId, ofpBriefingId: dispatch?.ofpBriefing?.id, flightDispatchId: dispatch?.id, vamsysBookingId: dispatch?.vamsysBookingId, type, mode, airportIcao, runway, aircraftType, aircraftRegistration, weightKg: weightKg === null ? null : Math.round(weightKg), input: body as unknown as Prisma.InputJsonValue, result: raw as unknown as Prisma.InputJsonValue, status: normalized.status, warningLevel: normalized.warnings.length ? "WARNING" : null, errorMessage: normalized.message, officialForDeparture: type === "TAKEOFF" && mode === "OFFICIAL" } });
    await writeAuditLogSafely({ action: `${actionPrefix}_COMPLETED`, entityType: "EfbPerformanceCalculation", entityId: calculation.id, message: `${type} performance completed with status ${normalized.status}.`, metadata: { pilotId, mode, flightDispatchId: dispatch?.id ?? null, warnings: normalized.warnings.length } });
    return { id: calculation.id, type, mode, status: normalized.status, airportIcao, runway, aircraftType, aircraftRegistration, weightKg: calculation.weightKg, summary, warnings: normalized.warnings, createdAt: calculation.createdAt };
  } catch (error) {
    const message = error instanceof Error ? error.message : `${type} performance failed.`;
    const status = /not.?supported|unsupported/i.test(message) ? "NOT_SUPPORTED" : "ERROR";
    const calculation = await prisma.efbPerformanceCalculation.create({ data: { pilotId, ofpBriefingId: dispatch?.ofpBriefing?.id, flightDispatchId: dispatch?.id, vamsysBookingId: dispatch?.vamsysBookingId, type, mode, airportIcao, runway, aircraftType, aircraftRegistration, weightKg: weightKg === null ? null : Math.round(weightKg), input: body as unknown as Prisma.InputJsonValue, status, errorMessage: message, officialForDeparture: type === "TAKEOFF" && mode === "OFFICIAL" } });
    await writeAuditLogSafely({ action: `${actionPrefix}_FAILED`, entityType: "EfbPerformanceCalculation", entityId: calculation.id, message, metadata: { pilotId, mode, flightDispatchId: dispatch?.id ?? null } });
    if (/reconnect navigraph|authorization was revoked|connect navigraph/i.test(message)) throw new EfbApiError(403, "NAVIGRAPH_RECONNECT_REQUIRED", "Reconnect Navigraph / SimBrief in AOC.");
    return { id: calculation.id, type, mode, status, airportIcao, runway, aircraftType, aircraftRegistration, weightKg: calculation.weightKg, summary: {}, warnings: [], error: message, createdAt: calculation.createdAt };
  }
}

export async function getPerformanceHistory(pilotId: string) {
  return prisma.efbPerformanceCalculation.findMany({ where: { pilotId }, select: { id: true, type: true, mode: true, status: true, airportIcao: true, runway: true, aircraftType: true, aircraftRegistration: true, weightKg: true, warningLevel: true, errorMessage: true, flightDispatchId: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 100 });
}

export async function markReadyForDeparture(pilotId: string, body: JsonRow) {
  const flightDispatchId = cleanText(body.flightDispatchId, 64);
  if (!flightDispatchId) throw new EfbApiError(400, "FLIGHT_DISPATCH_REQUIRED", "flightDispatchId is required.");
  await officialFlight(pilotId, flightDispatchId, cleanText(body.ofpBriefingId, 64));
  const calculation = await prisma.efbPerformanceCalculation.findFirst({ where: { pilotId, flightDispatchId, type: "TAKEOFF", mode: "OFFICIAL", officialForDeparture: true }, orderBy: { createdAt: "desc" } });
  const sourceStatus = calculation?.status ?? "MISSING";
  const status = sourceStatus === "OK" ? "READY" : ["WARNING", "NOT_SUPPORTED"].includes(sourceStatus) ? "WARNING" : "BLOCKED";
  const blockingReason = status === "BLOCKED" ? calculation ? `Takeoff performance status is ${sourceStatus}.` : "No official takeoff performance calculation exists." : null;
  const warnings = status === "WARNING" ? [`Takeoff performance status is ${sourceStatus}; pilot acknowledgement required.`] : [];
  const readiness = await prisma.efbDepartureReadiness.upsert({ where: { flightDispatchId }, create: { flightDispatchId, pilotId, status, takeoffPerformanceId: calculation?.id, blockingReason, warnings, readyAt: status === "READY" || status === "WARNING" ? new Date() : null }, update: { pilotId, status, takeoffPerformanceId: calculation?.id, blockingReason, warnings, readyAt: status === "READY" || status === "WARNING" ? new Date() : null } });
  if (calculation && ["READY", "WARNING"].includes(status)) await prisma.efbPerformanceCalculation.update({ where: { id: calculation.id }, data: { usedForReadyForDeparture: true } });
  const auditStatus = status === "READY" ? "MARKED" : status;
  await writeAuditLogSafely({ action: `EFB_READY_FOR_DEPARTURE_${auditStatus}`, entityType: "EfbDepartureReadiness", entityId: readiness.id, message: `Ready for Departure evaluated as ${status}.`, metadata: { pilotId, flightDispatchId, takeoffPerformanceId: calculation?.id ?? null, sourceStatus } });
  return readiness;
}
