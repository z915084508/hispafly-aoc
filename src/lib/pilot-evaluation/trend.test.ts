import assert from "node:assert/strict";
import { buildPilotPerformanceTrend, classifyTrend } from "./trend.ts";

assert.equal(classifyTrend(90, 84), "IMPROVING");
assert.equal(classifyTrend(80, 86), "DECLINING");
assert.equal(classifyTrend(88, 85), "STABLE");
assert.equal(classifyTrend(null, 85), "INSUFFICIENT_DATA");

const current = new Date("2026-08-27T12:00:00Z");
const previous = new Date("2026-08-20T12:00:00Z");
const declining = buildPilotPerformanceTrend([
  { calculatedAt: previous, overallScore: 92, safetyScore: 94, sopScore: 93, operationsScore: 88, reliabilityScore: 96, commandReadinessScore: 84 },
  { calculatedAt: current, overallScore: 85, safetyScore: 82, sopScore: 84, operationsScore: 87, reliabilityScore: 95, commandReadinessScore: 84 },
]);
assert.equal(declining.direction, "DECLINING");
assert.equal(declining.metrics.find((metric) => metric.metric === "safetyScore")?.delta, -12);

const improving = buildPilotPerformanceTrend([
  { calculatedAt: previous, overallScore: 82, safetyScore: 84, sopScore: 82, operationsScore: 83, reliabilityScore: 94, commandReadinessScore: 72 },
  { calculatedAt: current, overallScore: 89, safetyScore: 90, sopScore: 89, operationsScore: 85, reliabilityScore: 96, commandReadinessScore: 80 },
]);
assert.equal(improving.direction, "IMPROVING");

const insufficient = buildPilotPerformanceTrend([{
  calculatedAt: current,
  overallScore: 90,
  safetyScore: 90,
  sopScore: 90,
  operationsScore: 90,
  reliabilityScore: 90,
  commandReadinessScore: 90,
}]);
assert.equal(insufficient.direction, "INSUFFICIENT_DATA");

console.log("Pilot performance trend policy tests passed.");
