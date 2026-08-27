import type { Prisma, PrismaClient } from "@prisma/client";

export type ScoringRule = { code: string; label: string; group: string; condition: string; availability: "ACTIVE" | "PLANNED"; category: "OPERATIONAL" | "BONUS" | "INTEGRITY"; action: "ADD" | "DEDUCT" | "REVIEW" | "INVALIDATE" | "NONE"; points: number; enabled: boolean; metric?: "LANDING_G"; minValue?: number; maxValue?: number };
export type ScoringPolicy = { id: string; scopeKey: string; name: string; operationalWeight: number; efficiencyWeight: number; startingScore: number; version: number; rules: ScoringRule[] };
export type ScoringEvent = {
  id?: string; episodeId?: string | null; eventType: string; ruleCode?: string | null;
  status: string; scoreEligible: boolean; scoreImpact?: number; severity?: string;
  startedAt?: Date | string | null; confirmedAt?: Date | string | null; endedAt?: Date | string | null;
  timestamp?: Date | string; durationSeconds?: number | null; value?: number | null;
  peakValue?: number | null; endValue?: number | null; threshold?: number | null;
  confidence?: number | null; aircraftSnapshot?: unknown; metadata?: unknown;
};
const rule = (code: string, points = 0, action: ScoringRule["action"] = "DEDUCT"): ScoringRule => ({ code, label: code.replaceAll("_", " "), group: "FOQA v2", condition: "Confirmed episode with valid evidence; v2 severity bands", availability: "ACTIVE", category: "OPERATIONAL", action, points, enabled: true });
export const DEFAULT_SCORING_RULES: ScoringRule[] = [
  ...["OVERSPEED", "TAXI_OVERSPEED", "CLIMB_GEAR_LATE", "CRUISE_GEAR", "GEAR_OVERSPEED", "FLAP_OVERSPEED", "LANDING_QUALITY", "UNSTABLE_APPROACH", "LOW_LANDING_FUEL"].map(x => rule(x)),
  rule("TAKEOFF_FLAPS", 15), rule("TAXI_OUT_FLAPS"), rule("TAXI_IN_FLAPS", 1), rule("ON_BLOCK_FLAPS", 1),
  rule("TIME_ACCELERATION", 0, "REVIEW"), rule("SLEW", 0, "REVIEW"), rule("TELEPORT", 0, "REVIEW"), rule("MID_AIR_REFUELING", 0, "REVIEW"), rule("IMPOSSIBLE_POSITION_JUMP", 0, "REVIEW"),
  rule("GO_AROUND", 0, "NONE"), rule("HIGH_LANDING_FUEL", 0, "NONE"), rule("DIVERSION", 0, "REVIEW"),
  rule("STABLE_APPROACH", 2, "ADD"), rule("ENGINE_WARMUP_OK", 1, "ADD"), rule("ENGINE_COOLDOWN_OK", 1, "ADD"), rule("FULL_SOP_COMPLIANCE", 2, "ADD"),
];
// Retain policy identity/weights. Legacy landing rewards and sample-count points cannot override v2 safety bands.
export const mergeScoringRules = (value: unknown): ScoringRule[] => {
  const stored = Array.isArray(value) ? value as ScoringRule[] : [];
  return DEFAULT_SCORING_RULES.map(base => {
    const previous = stored.find(x => x.code === base.code);
    return { ...base, enabled: previous?.enabled ?? base.enabled,
      action: ["SLEW", "TELEPORT", "MID_AIR_REFUELING"].includes(base.code) && previous?.action === "INVALIDATE" ? "INVALIDATE" : base.action };
  });
};
export async function loadScoringPolicy(db: PrismaClient | Prisma.TransactionClient, fleetId?: string | null): Promise<ScoringPolicy> {
  const record = (fleetId ? await db.pirepScoringPolicy.findFirst({ where: { active: true, scopeKey: `FLEET:${fleetId}` } }) : null)
    ?? await db.pirepScoringPolicy.findFirst({ where: { active: true, scopeKey: "GLOBAL" } });
  return record ? { ...record, rules: mergeScoringRules(record.rules) } : { id: "builtin", scopeKey: "GLOBAL", name: "HISPAFLY FOQA v2", operationalWeight: 70, efficiencyWeight: 30, startingScore: 100, version: 2, rules: DEFAULT_SCORING_RULES };
}
export const object = (x: unknown): Record<string, unknown> => x && typeof x === "object" && !Array.isArray(x) ? x as Record<string, unknown> : {};
export const finite = (x: unknown): number | null => typeof x === "number" && Number.isFinite(x) ? x : null;
const field = (x: unknown, key: string): unknown => Object.entries(object(x)).find(([k]) => k.toLowerCase() === key.toLowerCase())?.[1];
export function eventKey(e: ScoringEvent): string {
  return e.episodeId ? `${e.eventType}:${e.episodeId}` : e.id ?? `${e.eventType}:${new Date(e.startedAt ?? e.timestamp ?? 0).toISOString()}`;
}
export function uniqueScoringEvents(events: ScoringEvent[]): ScoringEvent[] {
  const result = new Map<string, ScoringEvent>();
  for (const e of events) {
    const key = eventKey(e), previous = result.get(key);
    // Non-confirmed evidence wins over a duplicate confirmed sample, regardless of input order.
    if (!previous || (previous.status === "CONFIRMED" && e.status !== "CONFIRMED") ||
        (previous.status === e.status && (e.durationSeconds ?? 0) >= (previous.durationSeconds ?? 0))) result.set(key, e);
  }
  return [...result.values()];
}
export function landingQuality(landingG?: number | null, landingRate?: number | null) {
  const g = finite(landingG), rate = finite(landingRate), descent = rate == null ? null : Math.abs(rate);
  const level = Math.max(g == null ? 0 : g >= 2 ? 4 : g >= 1.8 ? 3 : g >= 1.6 ? 2 : g >= 1.5 ? 1 : 0,
    descent == null ? 0 : descent >= 900 ? 4 : descent >= 700 ? 3 : descent >= 550 ? 2 : descent >= 450 ? 1 : 0);
  return { impact: [0, -2, -7, -15, -25][level], review: level === 4, label: ["Normal", "Firm", "Hard", "Very hard", "Extreme"][level] };
}
export function scoreEvent(e: ScoringEvent, events: ScoringEvent[] = []): { impact: number; review: boolean; invalidate: boolean; category: string } {
  const none = { impact: 0, review: false, invalidate: false, category: "OPERATIONAL" };
  if (e.status !== "CONFIRMED" || !e.scoreEligible || (e.confidence != null && (!Number.isFinite(e.confidence) || e.confidence < 0.8))) return none;
  const code = e.eventType.replace(/_V2$/, ""), m = object(e.metadata), snap = e.aircraftSnapshot;
  const peak = finite(e.peakValue) ?? finite(e.value), duration = finite(e.durationSeconds) ?? 0;
  const penalty = (points: number, review = false, category = "OPERATIONAL") => ({ ...none, impact: -points, review, category });
  if (["SPEED_RECOVERED", "GEAR_RETRACTED", "PAUSE", "TELEMETRY_DROPOUT", "GO_AROUND", "HIGH_LANDING_FUEL", "SEATBELT", "HARD_LANDING"].includes(code) || code.startsWith("LANDING_G_")) return none;
  if (code === "OVERSPEED" || code === "TAXI_OVERSPEED") {
    if (m.atcHighSpeedAuthorized === true || duration < 10 || peak == null) return none;
    return code === "TAXI_OVERSPEED" ? peak <= 30 ? none : penalty(peak > 50 ? 10 : peak > 40 ? 6 : peak > 35 ? 3 : 1, peak > 50)
      : peak <= 250 ? none : penalty(peak > 300 ? 12 : peak > 280 ? 8 : peak > 260 ? 4 : 2, peak > 300);
  }
  if (code === "CLIMB_GEAR_LATE" || code === "CRUISE_GEAR") {
    const gear = finite(field(snap, "GearPositionPercent"));
    if (field(snap, "IsGearRetractable") !== true || field(snap, "IsOnGround") !== false || gear == null || gear <= 5 || gear > 100) return none;
    if (code === "CRUISE_GEAR") return penalty(duration >= 60 ? 12 : 8, duration >= 60);
    if (peak == null || peak <= 1500) return none;
    return penalty(peak > 5000 || duration > 60 ? 6 : peak > 2500 || duration >= 15 ? 3 : 1, duration > 60);
  }
  if (["GEAR_OVERSPEED", "DESCENT_GEAR_SPEED", "FLAP_OVERSPEED"].includes(code)) {
    const threshold = finite(e.threshold); if (peak == null || threshold == null || peak <= threshold) return none;
    const exceedance = finite(m.peakExceedance) ?? peak - threshold, flap = code === "FLAP_OVERSPEED";
    return penalty(exceedance > 15 ? flap ? 15 : 20 : exceedance > 5 ? flap ? 8 : 10 : flap ? 4 : 5, exceedance > 15);
  }
  if (code === "TAXI_OUT_FLAPS") return penalty(m.runwayApproachGate === true ? 2 : 0);
  if (["TAKEOFF_FLAPS", "TAKEOFF_FLAP_INVALID"].includes(code)) return penalty(15, true);
  if (["TAXI_IN_FLAPS", "ON_BLOCK_FLAPS"].includes(code)) return penalty(1);
  if (/BEACON|STROBE|LANDING_LIGHT|TAXI_LIGHT|NAV_LIGHT|NAVIGATION_LIGHT|TRANSPONDER/.test(code)) {
    if (code.includes("TRANSPONDER") && m.telemetrySupported !== true) return none;
    return penalty(/BEACON|STROBE|TRANSPONDER/.test(code) ? 2 : 1, false, "SOP_LIGHT");
  }
  if (code === "LANDING_QUALITY") {
    const quality = landingQuality(finite(m.landingG), finite(m.landingRate)); return { ...none, impact: quality.impact, review: quality.review };
  }
  if (["UNSTABLE_APPROACH", "APPROACH_GEAR_LATE", "APPROACH_FLAPS_LATE"].includes(code)) {
    const ra = finite(m.minimumRadioAltitudeFeet) ?? finite(field(snap, "RadioAltitudeFeet"));
    const time = new Date(e.startedAt ?? e.timestamp ?? 0).getTime();
    const next = events.filter(x => ["GO_AROUND", "LANDING", "LANDING_QUALITY"].includes(x.eventType) && new Date(x.timestamp ?? 0).getTime() >= time)
      .sort((a,b) => new Date(a.timestamp ?? 0).getTime() - new Date(b.timestamp ?? 0).getTime())[0];
    const recovered = m.endReason === "Condition recovered";
    const continued = !recovered && next?.eventType !== "GO_AROUND" && next != null;
    return penalty(ra != null && ra < 500 && continued ? 10 : duration < 3 ? 1 : 2, ra != null && ra < 500 && continued);
  }
  if (code.includes("_VS_") || code === "EXCESSIVE_DESCENT_RATE") return penalty(peak != null && peak > 2000 ? 8 : peak != null && peak > 1500 ? 5 : 3);
  if (code.includes("BANK")) return penalty(peak != null && peak > 45 ? 10 : 5);
  if (/GPWS|TAWS/.test(code)) return { ...none, review: true };
  if (["LOW_LANDING_FUEL", "CRUISE_LOW_FUEL"].includes(code)) {
    const threshold = finite(e.threshold), fuel = finite(e.endValue) ?? finite(e.value);
    if (threshold == null || threshold <= 0 || fuel == null || fuel < 0 || fuel >= threshold) return none;
    const shortfall = (threshold - fuel) / threshold; return penalty(shortfall > .25 ? 15 : shortfall >= .1 ? 8 : 3, shortfall > .25);
  }
  if (["TIME_ACCELERATION", "SLEW", "TELEPORT", "MID_AIR_REFUELING", "IMPOSSIBLE_POSITION_JUMP", "DIVERSION"].includes(code)) return { ...none, review: true, invalidate: false, category: "INTEGRITY" };
  const bonuses: Record<string, number> = { STABLE_APPROACH: 2, ENGINE_WARMUP_OK: 1, ENGINE_COOLDOWN_OK: 1, FULL_SOP_COMPLIANCE: 2 };
  return bonuses[code] ? { ...none, impact: bonuses[code], category: "BONUS" } : none;
}
export function calculatePirepScore(policy: ScoringPolicy, operationalEvents: ScoringEvent[], efficiencyScore: number | null, metrics: { landingG?: number | null; landingRate?: number | null } = {}) {
  const events = uniqueScoringEvents(operationalEvents);
  // Compatibility for pre-v2 reports only. Never recreate a dismissed landing event from metrics.
  if (!events.some(x => x.eventType === "LANDING_QUALITY") && (finite(metrics.landingG) != null || finite(metrics.landingRate) != null))
    events.push({ episodeId: "legacy-touchdown", eventType: "LANDING_QUALITY", status: "CONFIRMED", scoreEligible: true, metadata: metrics });
  let sop = 0, bonuses = 0;
  const applied = events.map(e => {
    const result = scoreEvent(e, events);
    const configured = policy.rules.find(r => r.code === e.eventType);
    const disabled = configured?.enabled === false;
    if (result.review && configured?.action === "INVALIDATE" && result.category === "INTEGRITY") result.invalidate = true;
    let impact = disabled ? 0 : result.impact;
    if (result.category === "SOP_LIGHT") { impact = Math.max(impact, -8 - sop); sop += impact; }
    if (impact > 0) { impact = Math.min(impact, 5 - bonuses); bonuses += impact; }
    return { eventId: e.id ?? null, episodeId: e.episodeId ?? null, code: e.eventType, category: result.category,
      originalImpact: result.impact, impact, count: 1, requiresReview: !disabled && result.review, invalidated: !disabled && result.invalidate };
  });
  const operationalScore = Math.max(0, Math.min(100, 100 + applied.reduce((n,e) => n + e.impact, 0)));
  const efficiency = finite(efficiencyScore); const ew = efficiency == null ? 0 : 30, ow = 70;
  const totalScore = Math.round((operationalScore * ow + Math.max(0, Math.min(100, efficiency ?? 0)) * ew) / (ow + ew));
  return { totalScore, operationalScore, efficiencyScore: efficiency, requiresReview: applied.some(x => x.requiresReview), invalidated: applied.some(x => x.invalidated),
    details: { engineVersion: 2, policyId: policy.id, policyScope: policy.scopeKey, policyName: policy.name, policyVersion: policy.version,
      weights: { operational: ow, efficiency: ew }, operationalScore, efficiencyScore: efficiency, totalScore, appliedRules: applied,
      scoredEvents: applied.filter(x => x.impact !== 0).length, reviewEvents: applied.filter(x => x.requiresReview).length,
      dataQualityEvents: events.filter(x => x.status === "DATA_QUALITY").length, sopPenalty: sop, positiveBonus: bonuses } as Prisma.InputJsonValue };
}
