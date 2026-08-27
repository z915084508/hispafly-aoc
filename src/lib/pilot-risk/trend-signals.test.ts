import assert from "node:assert/strict";
import { deriveTrendRiskSignals } from "./trend-signals.ts";
import type { PilotPerformanceTrend } from "../pilot-evaluation/trend.ts";

const declining: PilotPerformanceTrend = {
  policyVersion: 1,
  currentCalculatedAt: new Date("2026-08-27T00:00:00Z"),
  previousCalculatedAt: new Date("2026-08-20T00:00:00Z"),
  direction: "DECLINING",
  metrics: [
    { metric: "overallScore", current: 82, previous: 91, delta: -9, direction: "DECLINING" },
    { metric: "safetyScore", current: 79, previous: 92, delta: -13, direction: "DECLINING" },
    { metric: "sopScore", current: 77, previous: 90, delta: -13, direction: "DECLINING" },
    { metric: "operationsScore", current: 85, previous: 86, delta: -1, direction: "STABLE" },
    { metric: "reliabilityScore", current: 95, previous: 95, delta: 0, direction: "STABLE" },
    { metric: "commandReadinessScore", current: 80, previous: 82, delta: -2, direction: "STABLE" },
  ],
};

const signals = deriveTrendRiskSignals("pilot-1", declining);
assert.equal(signals.length, 3);
assert.equal(signals.find((signal) => signal.category === "SAFETY")?.severity, "HIGH");
assert.equal(signals.find((signal) => signal.category === "SOP")?.severity, "HIGH");
assert.equal(signals.every((signal) => signal.source === "TREND"), true);
assert.equal(deriveTrendRiskSignals("pilot-1", { ...declining, direction: "STABLE" }).length, 0);

console.log("Pilot trend risk signal policy tests passed.");
