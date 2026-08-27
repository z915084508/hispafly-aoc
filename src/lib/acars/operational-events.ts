import { createHash } from "node:crypto";
import { finite, object, scoreEvent, type ScoringEvent } from "../pirep/scoring.ts";
export type OperationalEventInput = {
  eventType: string; severity?: string; timestamp: string; flightPhase?: string | null; source?: string;
  episodeId?: string | null; ruleCode?: string; status?: string; startedAt?: string; confirmedAt?: string;
  endedAt?: string | null; durationSeconds?: number; value?: number; peakValue?: number; endValue?: number;
  threshold?: number; scoreEligible?: boolean; scoreImpact?: number; confidence?: number;
  latitude?: number | null; longitude?: number | null; altitudeFeet?: number | null; groundSpeedKnots?: number | null;
  fuelKg?: number | null; aircraftSnapshot?: unknown; metadata?: unknown;
};
type RawEvent = { sequenceNumber: number; type: string; recordedAt: Date | string; phaseAfter?: string | null; phaseBefore?: string | null;
  message?: string | null; numericValue?: number | null; textValue?: string | null;
  latitude?: number | null; longitude?: number | null; altitudeFeet?: number | null; groundSpeedKnots?: number | null; fuelKg?: number | null };
export type NormalizedOperationalEvent = ScoringEvent & { episodeId: string; timestamp: Date; severity: string; source: string; flightPhase: string | null;
  ruleCode: string; scoreImpact: number; originalImpact: number; requiresReview: boolean; latitude?: number | null; longitude?: number | null;
  altitudeFeet?: number | null; groundSpeedKnots?: number | null; fuelKg?: number | null; metadata: Record<string, unknown> };
const get = (x: unknown, key: string) => Object.entries(object(x)).find(([k]) => k.toLowerCase() === key.toLowerCase())?.[1];
const date = (x: unknown): Date | null => (typeof x === "string" || x instanceof Date) && Number.isFinite(new Date(x).getTime()) ? new Date(x) : null;
const string = (x: unknown) => typeof x === "string" ? x : null;
const aliases: Record<string, string> = { SessionStarted: "ACARS_SESSION_START", OffBlock: "BLOCK_OFF", EngineStarted: "ENGINE_START", TaxiOutStarted: "TAXI", Takeoff: "TAKEOFF", Passing10000: "PASSING_10000", TopOfDescent: "TOD", Landing: "LANDING", OnBlock: "BLOCK_ON", GoAround: "GO_AROUND", Diversion: "DIVERSION", Overspeed: "OVERSPEED", HardLanding: "HARD_LANDING", PauseStarted: "PAUSE", SimulationRateChanged: "TIME_ACCELERATION", SIM_RATE: "TIME_ACCELERATION", SlewDetected: "SLEW", SimulatorDisconnected: "TELEMETRY_DROPOUT", SpeedRecovered: "SPEED_RECOVERED", SpeedRestrictionWaiverEnabled: "ATC_SPEED_AUTHORIZATION_ENABLED", SpeedRestrictionWaiverDisabled: "ATC_SPEED_AUTHORIZATION_DISABLED" };
const canonical = (x: string) => aliases[x] ?? x;
export function normalizeOperationalEvents(events: RawEvent[], operationalEvents: OperationalEventInput[], sessionId: string): NormalizedOperationalEvent[] {
  const raw: OperationalEventInput[] = events.map(e => ({ eventType: e.type, timestamp: new Date(e.recordedAt).toISOString(),
    flightPhase: e.phaseAfter ?? e.phaseBefore, latitude: e.latitude, longitude: e.longitude, altitudeFeet: e.altitudeFeet,
    groundSpeedKnots: e.groundSpeedKnots, fuelKg: e.fuelKg, source: "ACARS_AUTO",
    metadata: { message: e.message, numericValue: e.numericValue, textValue: e.textValue, sourceSequenceNumber: e.sequenceNumber } }));
  const merged = new Map<string, NormalizedOperationalEvent>();
  for (const input of [...raw, ...operationalEvents]) {
    const meta = object(input.metadata); const textValue = get(meta, "TextValue");
    let payload: Record<string, unknown> = {}; let malformed = false;
    if (typeof textValue === "string" && textValue.trim().startsWith("{")) {
      try { payload = object(JSON.parse(textValue)); } catch { malformed = true; }
    }
    const foqa = ["FoqaEvent", "FOQA_EVENT", "FoqaEpisodeUpdate", "FOQA_DATA_QUALITY"].includes(input.eventType) || get(payload, "RuleId") != null;
    if (foqa && !/^[A-Z][A-Z0-9_]{1,100}$/.test(string(get(payload, "RuleId")) ?? input.ruleCode?.replace(/_V2$/, "") ?? "")) malformed = true;
    const eventType = malformed ? "FOQA_DATA_QUALITY" : canonical(string(get(payload, "RuleId")) ?? input.eventType);
    const timestamp = date(get(payload, "Timestamp")) ?? date(input.timestamp);
    if (!timestamp) throw new Error("Invalid operational event timestamp.");
    const startedAt = date(get(payload, "StartedAt")) ?? date(input.startedAt) ?? timestamp;
    const confirmedAt = date(get(payload, "ConfirmedAt")) ?? date(input.confirmedAt) ?? timestamp;
    const endedAt = date(get(payload, "EndedAt")) ?? date(input.endedAt);
    const durationSeconds = finite(get(payload, "DurationSeconds")) ?? finite(input.durationSeconds);
    if (confirmedAt < startedAt || endedAt && endedAt < startedAt || durationSeconds != null && durationSeconds < 0) malformed = true;
    const episodeId = string(get(payload, "EpisodeId")) ?? input.episodeId ?? createHash("sha256").update(`${sessionId}:${eventType}:${startedAt.toISOString()}`).digest("hex");
    let status = string(get(payload, "Status")) ?? input.status ?? "CONFIRMED";
    if (!["CONFIRMED", "DISMISSED", "SUPPRESSED", "DATA_QUALITY"].includes(status)) malformed = true;
    if (malformed || eventType === "TELEMETRY_DROPOUT") status = "DATA_QUALITY";
    const snapshot = get(payload, "Snapshot") ?? input.aircraftSnapshot ?? null;
    // Missing/invalid normalization cannot become a pilot deviation, even on older clients.
    if (["CLIMB_GEAR_LATE", "CRUISE_GEAR"].includes(eventType) &&
      (get(snapshot, "IsGearRetractable") !== true || get(snapshot, "IsOnGround") !== false || finite(get(snapshot, "GearPositionPercent")) == null || Number(get(snapshot, "GearPositionPercent")) < 0 || Number(get(snapshot, "GearPositionPercent")) > 100)) status = "DATA_QUALITY";
    if (/FLAPS|FLAP_INVALID|FLAP_OVERSPEED/.test(eventType) && foqa) {
      const flaps = finite(get(snapshot, "FlapsPositionPercent"));
      if (flaps == null || flaps < 0 || flaps > 100) status = "DATA_QUALITY";
    }
    const severityValue = get(payload, "Severity") ?? input.severity;
    const severity = typeof severityValue === "number" ? ["INFO", "MINOR", "MAJOR", "SEVERE"][severityValue] ?? "INFO" : String(severityValue ?? "INFO").toUpperCase();
    const eligible = status === "CONFIRMED" && (get(payload, "ScoreEligible") ?? input.scoreEligible ?? (foqa || ["TIME_ACCELERATION", "SLEW", "DIVERSION"].includes(eventType))) === true;
    const event: NormalizedOperationalEvent = { episodeId, eventType, timestamp, startedAt, confirmedAt, endedAt, durationSeconds,
      ruleCode: string(get(payload, "RuleCode")) ?? input.ruleCode ?? `${eventType}_V2`, status, severity,
      flightPhase: string(get(payload, "Phase")) ?? input.flightPhase ?? null, source: foqa ? "ACARS_FOQA" : input.source ?? "ACARS_AUTO",
      value: finite(get(payload, "Value")) ?? finite(input.value) ?? (!foqa ? finite(get(meta, "NumericValue")) : null), peakValue: finite(get(payload, "PeakValue")) ?? finite(input.peakValue),
      endValue: finite(get(payload, "EndValue")) ?? finite(input.endValue), threshold: finite(get(payload, "Threshold")) ?? finite(input.threshold),
      confidence: finite(get(payload, "Confidence")) ?? finite(input.confidence) ?? (malformed ? 0 : 1), scoreEligible: eligible,
      scoreImpact: 0, originalImpact: 0, requiresReview: false, aircraftSnapshot: snapshot,
      latitude: finite(input.latitude), longitude: finite(input.longitude), altitudeFeet: finite(input.altitudeFeet), groundSpeedKnots: finite(input.groundSpeedKnots), fuelKg: finite(input.fuelKg),
      metadata: { ...meta, foqa: payload, dataQualityReason: malformed ? "Malformed or inconsistent FOQA payload" : null,
        peakExceedance: finite(get(payload, "PeakExceedance")), minimumRadioAltitudeFeet: finite(get(payload, "MinimumRadioAltitudeFeet")), runwayApproachGate: get(payload, "RunwayApproachGate") === true,
        eventName: string(get(payload, "EventName")), endReason: string(get(payload, "EndReason")) } };
    // Both transport channels normalize to the same episode. Closure updates replace confirmation, never add a penalty.
    const key = `${eventType}:${episodeId}`, previous = merged.get(key);
    if (!previous || (previous.status === "CONFIRMED" && status !== "CONFIRMED") ||
        (previous.status === status && (durationSeconds ?? 0) >= (previous.durationSeconds ?? 0))) merged.set(key, event);
  }
  const result = [...merged.values()].sort((a,b) => a.timestamp.getTime() - b.timestamp.getTime());
  for (const event of result) {
    const impact = scoreEvent(event, result); event.scoreImpact = event.originalImpact = impact.impact; event.requiresReview = impact.review;
  }
  return result;
}
export function mergeOperationalBuffer(previous: unknown, incoming: OperationalEventInput[]): OperationalEventInput[] {
  const map = new Map<string, OperationalEventInput>();
  for (const e of [...(Array.isArray(previous) ? previous as OperationalEventInput[] : []), ...incoming]) {
    if (!e || typeof e.eventType !== "string" || !date(e.timestamp)) throw new Error("Invalid operational event envelope.");
    const key = `${e.eventType}:${e.episodeId ?? ""}:${e.timestamp}`;
    map.set(key, e);
  }
  if (map.size > 20000) throw new Error("Operational event limit exceeded.");
  return [...map.values()];
}
