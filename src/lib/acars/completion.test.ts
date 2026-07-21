import assert from "node:assert/strict";
import { telemetrySummary, validateTelemetryBatch } from "./completion.ts";

const summary = telemetrySummary([
  { recordedAt: new Date("2026-07-21T10:00:00Z"), fuelKg: 5000, onGround: true },
  { recordedAt: new Date("2026-07-21T10:10:00Z"), fuelKg: 4700, onGround: false },
  { recordedAt: new Date("2026-07-21T11:00:00Z"), fuelKg: 2500, onGround: false },
  { recordedAt: new Date("2026-07-21T11:10:00Z"), fuelKg: 2300, onGround: true },
], [{ type: "LANDING", numericValue: -184 }]);
assert.deepEqual(summary, { blockTimeMinutes: 70, flightTimeMinutes: 50, fuelUsedKg: 2700, landingRate: -184 });

validateTelemetryBatch({ currentPhase: "Cruise", positions: [{ sequenceNumber: 1, recordedAt: "2026-07-21T10:00:00Z", latitude: 40, longitude: -3, headingDegrees: 180, fuelKg: 5000 }] });
assert.throws(() => validateTelemetryBatch({ currentPhase: "", positions: [] }), /phase/);
assert.throws(() => validateTelemetryBatch({ currentPhase: "Cruise", positions: [{ sequenceNumber: -1, recordedAt: "bad" }] }), /sequence/);
assert.throws(() => validateTelemetryBatch({ currentPhase: "Cruise", positions: [{ sequenceNumber: 1, recordedAt: "2026-07-21T10:00:00Z", latitude: 91 }] }), /latitude/);
assert.throws(() => validateTelemetryBatch({ currentPhase: "Cruise", positions: [{ sequenceNumber: 1, recordedAt: "2026-07-21T10:00:00Z", headingDegrees: 360 }] }), /heading/);
console.log("ACARS completion rules passed.");
