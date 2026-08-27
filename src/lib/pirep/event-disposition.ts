import { calculatePirepScore, type ScoringEvent, type ScoringPolicy } from "./scoring.ts";
export const EVENT_STATUSES = ["CONFIRMED", "DISMISSED", "SUPPRESSED", "DATA_QUALITY"] as const;
export function dispositionScore(policy: ScoringPolicy, events: ScoringEvent[], eventId: string, status: string, efficiency: number | null, metrics: { landingG?: number | null; landingRate?: number | null }) {
  if (!(EVENT_STATUSES as readonly string[]).includes(status)) throw new Error("Invalid event disposition.");
  if (!events.some(e => e.id === eventId)) throw new Error("Operational event not found.");
  return calculatePirepScore(policy, events.map(e => e.id === eventId ? { ...e, status } : e), efficiency, metrics);
}
