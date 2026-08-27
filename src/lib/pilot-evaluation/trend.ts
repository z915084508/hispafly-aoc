export const PILOT_TREND_POLICY_VERSION = 1;

export type TrendDirection = "IMPROVING" | "STABLE" | "DECLINING" | "INSUFFICIENT_DATA";
export type TrendMetricKey = "overallScore" | "safetyScore" | "sopScore" | "operationsScore" | "reliabilityScore" | "commandReadinessScore";

export type EvaluationTrendSnapshot = {
  calculatedAt: Date;
  overallScore: number | null;
  safetyScore: number | null;
  sopScore: number | null;
  operationsScore: number | null;
  reliabilityScore: number | null;
  commandReadinessScore: number | null;
};

export type MetricTrend = {
  metric: TrendMetricKey;
  current: number | null;
  previous: number | null;
  delta: number | null;
  direction: TrendDirection;
};

export type PilotPerformanceTrend = {
  policyVersion: number;
  currentCalculatedAt: Date | null;
  previousCalculatedAt: Date | null;
  direction: TrendDirection;
  metrics: MetricTrend[];
};

const METRICS: TrendMetricKey[] = ["overallScore", "safetyScore", "sopScore", "operationsScore", "reliabilityScore", "commandReadinessScore"];
const MATERIAL_DELTA = 5;

export function classifyTrend(current: number | null, previous: number | null): TrendDirection {
  if (current === null || previous === null) return "INSUFFICIENT_DATA";
  const delta = current - previous;
  if (delta >= MATERIAL_DELTA) return "IMPROVING";
  if (delta <= -MATERIAL_DELTA) return "DECLINING";
  return "STABLE";
}

export function buildPilotPerformanceTrend(input: EvaluationTrendSnapshot[]): PilotPerformanceTrend {
  const snapshots = [...input].sort((a, b) => b.calculatedAt.getTime() - a.calculatedAt.getTime());
  const current = snapshots[0] ?? null;
  const previous = snapshots[1] ?? null;
  const metrics = METRICS.map((metric): MetricTrend => {
    const currentValue = current?.[metric] ?? null;
    const previousValue = previous?.[metric] ?? null;
    return {
      metric,
      current: currentValue,
      previous: previousValue,
      delta: currentValue === null || previousValue === null ? null : currentValue - previousValue,
      direction: classifyTrend(currentValue, previousValue),
    };
  });

  const material = metrics.filter((metric) => metric.metric !== "overallScore" && metric.direction !== "INSUFFICIENT_DATA");
  const declining = material.filter((metric) => metric.direction === "DECLINING").length;
  const improving = material.filter((metric) => metric.direction === "IMPROVING").length;
  const direction: TrendDirection = !current || !previous
    ? "INSUFFICIENT_DATA"
    : declining >= 2
      ? "DECLINING"
      : improving >= 2 && declining === 0
        ? "IMPROVING"
        : "STABLE";

  return {
    policyVersion: PILOT_TREND_POLICY_VERSION,
    currentCalculatedAt: current?.calculatedAt ?? null,
    previousCalculatedAt: previous?.calculatedAt ?? null,
    direction,
    metrics,
  };
}
