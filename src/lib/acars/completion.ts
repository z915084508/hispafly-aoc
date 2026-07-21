export type CompletionPosition = {
  recordedAt: Date;
  fuelKg: number | null;
  onGround: boolean | null;
};

export type CompletionEvent = {
  type: string;
  numericValue: number | null;
};

export function telemetrySummary(positions: CompletionPosition[], events: CompletionEvent[]) {
  const ordered = [...positions].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
  const airborne = ordered.filter((item) => item.onGround === false);
  const blockStart = ordered.at(0)?.recordedAt;
  const blockEnd = ordered.at(-1)?.recordedAt;
  const flightStart = airborne.at(0)?.recordedAt ?? blockStart;
  const flightEnd = airborne.at(-1)?.recordedAt ?? blockEnd;
  const firstFuel = ordered.find((item) => item.fuelKg != null)?.fuelKg ?? null;
  const lastFuel = ordered.findLast((item) => item.fuelKg != null)?.fuelKg ?? null;
  const landing = [...events].reverse().find((item) => /LANDING|TOUCHDOWN/i.test(item.type) && item.numericValue != null);
  const minutes = (start?: Date, end?: Date) => start && end ? Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000)) : null;
  return {
    blockTimeMinutes: minutes(blockStart, blockEnd),
    flightTimeMinutes: minutes(flightStart, flightEnd),
    fuelUsedKg: firstFuel != null && lastFuel != null ? Math.max(0, Math.round(firstFuel - lastFuel)) : null,
    landingRate: landing?.numericValue == null ? null : Math.round(landing.numericValue),
  };
}

export function validateTelemetryBatch(body: {
  currentPhase: unknown;
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
}
