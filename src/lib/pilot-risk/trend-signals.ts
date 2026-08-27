import type { PilotPerformanceTrend } from "@/lib/pilot-evaluation/trend";
import type { PilotRiskSignalInput } from "./types";

export const PILOT_RISK_POLICY_VERSION = 1;

export function deriveTrendRiskSignals(pilotId: string, trend: PilotPerformanceTrend): PilotRiskSignalInput[] {
  if (trend.direction !== "DECLINING") return [];
  const signals: PilotRiskSignalInput[] = [];
  const byMetric = new Map(trend.metrics.map((metric) => [metric.metric, metric]));
  const safety = byMetric.get("safetyScore");
  const sop = byMetric.get("sopScore");

  signals.push({
    pilotId,
    source: "TREND",
    category: "OPERATIONS",
    severity: "MODERATE",
    signalKey: `trend:overall:v${PILOT_RISK_POLICY_VERSION}`,
    title: "Material performance decline",
    reason: "At least two core performance dimensions are materially declining in the latest evaluation window.",
    evidence: { policyVersion: PILOT_RISK_POLICY_VERSION, direction: trend.direction, metrics: trend.metrics },
  });

  if (safety?.direction === "DECLINING") {
    signals.push({
      pilotId,
      source: "TREND",
      category: "SAFETY",
      severity: (safety.current ?? 100) < 85 ? "HIGH" : "MODERATE",
      signalKey: `trend:safety:v${PILOT_RISK_POLICY_VERSION}`,
      title: "Safety performance decline",
      reason: `Safety score declined${safety.delta === null ? "" : ` by ${Math.abs(safety.delta)} points`} in the latest evaluation window.`,
      evidence: { policyVersion: PILOT_RISK_POLICY_VERSION, metric: safety },
    });
  }

  if (sop?.direction === "DECLINING") {
    signals.push({
      pilotId,
      source: "TREND",
      category: "SOP",
      severity: (sop.current ?? 100) < 80 ? "HIGH" : "MODERATE",
      signalKey: `trend:sop:v${PILOT_RISK_POLICY_VERSION}`,
      title: "SOP compliance decline",
      reason: `SOP score declined${sop.delta === null ? "" : ` by ${Math.abs(sop.delta)} points`} in the latest evaluation window.`,
      evidence: { policyVersion: PILOT_RISK_POLICY_VERSION, metric: sop },
    });
  }

  return signals;
}
