import { landingQuality } from "../pirep/scoring.ts";
export type CompletionPosition = {
  recordedAt: Date;
  fuelKg: number | null;
  onGround: boolean | null;
};

export type CompletionEvent = {
  type: string;
  numericValue: number | null;
};

export type AirportCoordinates = {
  latitude: number | null;
  longitude: number | null;
};

const minutesBetween = (start?: Date, end?: Date) =>
  start && end ? Math.max(0, (end.getTime() - start.getTime()) / 60_000) : null;

export function telemetrySummary(positions: CompletionPosition[], events: CompletionEvent[]) {
  const ordered = [...positions].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
  const airborne = ordered.filter((item) => item.onGround === false);
  const blockStart = ordered.at(0)?.recordedAt;
  const blockEnd = ordered.at(-1)?.recordedAt;
  const flightStart = airborne.at(0)?.recordedAt ?? blockStart;
  const flightEnd = airborne.at(-1)?.recordedAt ?? blockEnd;

  // Some FSUIPC aircraft briefly report zero fuel while their custom systems
  // initialise or disconnect. Zero/invalid samples are unavailable, not an
  // empty tank. Fuel burn is trusted only when valid samples cover essentially
  // the complete recorded block period; a mid-flight fragment must not be used
  // for economics or efficiency scoring.
  const validFuelSamples = ordered.filter(
    (item) => item.fuelKg != null && Number.isFinite(item.fuelKg) && item.fuelKg > 0,
  );
  const firstFuelSample = validFuelSamples.at(0);
  const lastFuelSample = validFuelSamples.at(-1);
  const firstFuel = firstFuelSample?.fuelKg ?? null;
  const lastFuel = lastFuelSample?.fuelKg ?? null;
  const observedFuelUsedKg = firstFuel != null && lastFuel != null && firstFuel >= lastFuel
    ? Math.round(firstFuel - lastFuel)
    : null;

  const blockCoverageMinutes = minutesBetween(blockStart, blockEnd);
  const fuelCoverageMinutes = minutesBetween(firstFuelSample?.recordedAt, lastFuelSample?.recordedAt);
  const firstSampleDelayMinutes = minutesBetween(blockStart, firstFuelSample?.recordedAt);
  const lastSampleGapMinutes = minutesBetween(lastFuelSample?.recordedAt, blockEnd);
  const fuelCoveragePercent = blockCoverageMinutes != null && blockCoverageMinutes > 0 && fuelCoverageMinutes != null
    ? Math.min(100, Math.round((fuelCoverageMinutes / blockCoverageMinutes) * 1000) / 10)
    : null;
  const fuelDataComplete = observedFuelUsedKg != null
    && validFuelSamples.length >= 2
    && (firstSampleDelayMinutes ?? Number.POSITIVE_INFINITY) <= 2
    && (lastSampleGapMinutes ?? Number.POSITIVE_INFINITY) <= 2
    && (fuelCoveragePercent ?? 0) >= 90;

  const landing = [...events].reverse().find(
    (item) => /LANDING|TOUCHDOWN/i.test(item.type) && item.numericValue != null,
  );
  const roundedMinutes = (start?: Date, end?: Date) => {
    const value = minutesBetween(start, end);
    return value == null ? null : Math.round(value);
  };

  return {
    blockTimeMinutes: roundedMinutes(blockStart, blockEnd),
    flightTimeMinutes: roundedMinutes(flightStart, flightEnd),
    fuelUsedKg: fuelDataComplete ? observedFuelUsedKg : null,
    observedFuelUsedKg,
    fuelDataComplete,
    fuelSampleCount: validFuelSamples.length,
    fuelCoveragePercent,
    firstFuelKg: firstFuel,
    lastFuelKg: lastFuel,
    landingRate: landing?.numericValue == null ? null : Math.round(landing.numericValue),
  };
}

export function greatCircleDistanceNm(departure: AirportCoordinates, arrival: AirportCoordinates): number | null {
  const { latitude: lat1, longitude: lon1 } = departure;
  const { latitude: lat2, longitude: lon2 } = arrival;
  if ([lat1, lon1, lat2, lon2].some((value) => value == null || !Number.isFinite(value))) return null;
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(lat2! - lat1!);
  const dLon = radians(lon2! - lon1!);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(lat1!)) * Math.cos(radians(lat2!)) * Math.sin(dLon / 2) ** 2;
  return Math.round(3440.065 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function nativePirepScore(landingRate: number | null): number {
  // Legacy callers use the same v2 landing band, never a second continuous landing-rate scale.
  return 100 + landingQuality(null, landingRate).impact;
}

export function validateTelemetryBatch(body: {
  currentPhase: unknown;
  completion?: {
    initialFuelKg?: number | null;
    finalFuelKg?: number | null;
    fuelUsedKg?: number | null;
    landingRateFeetPerMinute?: number | null;
    landingG?: number | null;
  } | null;
  positions?: Array<{ sequenceNumber: number; recordedAt: string; latitude?: number | null; longitude?: number | null; headingDegrees?: number | null; fuelKg?: number | null }>;
  events?: Array<{ sequenceNumber: number; recordedAt: string }>;
}) {
  if (typeof body.currentPhase !== "string" || !body.currentPhase.trim() || body.currentPhase.length > 64) throw new Error("Invalid ACARS phase.");
  if ((body.positions?.length ?? 0) > 500 || (body.events?.length ?? 0) > 500) throw new Error("Telemetry batch exceeds 500 records.");
  for (const item of [...(body.positions ?? []), ...(body.events ?? [])]) {
    if (!Number.isSafeInteger(item.sequenceNumber) || item.sequenceNumber < 0) throw new Error("Invalid telemetry sequence number.");
    if (!Number.isFinite(new Date(item.recordedAt).getTime())) throw new Error("Invalid telemetry timestamp.");
  }
  for (const item of body.positions ?? []) {
    if (item.latitude != null && (item.latitude < -90 || item.latitude > 90)) throw new Error("Invalid telemetry latitude.");
    if (item.longitude != null && (item.longitude < -180 || item.longitude > 180)) throw new Error("Invalid telemetry longitude.");
    if (item.headingDegrees != null && (item.headingDegrees < 0 || item.headingDegrees >= 360)) throw new Error("Invalid telemetry heading.");
    if (item.fuelKg != null && item.fuelKg < 0) throw new Error("Invalid telemetry fuel quantity.");
  }
  if (body.completion) {
    for (const value of [body.completion.initialFuelKg, body.completion.finalFuelKg, body.completion.fuelUsedKg]) {
      if (value != null && (!Number.isFinite(value) || value < 0)) throw new Error("Invalid ACARS completion fuel quantity.");
    }
    const landingRate = body.completion.landingRateFeetPerMinute;
    if (landingRate != null && (!Number.isFinite(landingRate) || Math.abs(landingRate) > 10_000)) {
      throw new Error("Invalid ACARS completion landing rate.");
    }
    const landingG = body.completion.landingG;
    if (landingG != null && (!Number.isFinite(landingG) || landingG <= 0.2 || landingG >= 6)) throw new Error("Invalid ACARS completion landing G.");
  }
}
