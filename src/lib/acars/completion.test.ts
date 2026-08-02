import assert from "node:assert/strict";
import { greatCircleDistanceNm, nativePirepScore, telemetrySummary, validateTelemetryBatch } from "./completion.ts";

const summary = telemetrySummary([
  { recordedAt: new Date("2026-07-21T10:00:00Z"), fuelKg: 5000, onGround: true },
  { recordedAt: new Date("2026-07-21T10:10:00Z"), fuelKg: 4700, onGround: false },
  { recordedAt: new Date("2026-07-21T11:00:00Z"), fuelKg: 2500, onGround: false },
  { recordedAt: new Date("2026-07-21T11:10:00Z"), fuelKg: 2300, onGround: true },
], [{ type: "LANDING", numericValue: -184 }]);
assert.deepEqual(summary, {
  blockTimeMinutes: 70,
  flightTimeMinutes: 50,
  fuelUsedKg: 2700,
  observedFuelUsedKg: 2700,
  fuelDataComplete: true,
  fuelSampleCount: 4,
  fuelCoveragePercent: 100,
  firstFuelKg: 5000,
  lastFuelKg: 2300,
  landingRate: -184,
});

const incompleteFuel = telemetrySummary([
  { recordedAt: new Date("2026-07-21T10:00:00Z"), fuelKg: null, onGround: true },
  { recordedAt: new Date("2026-07-21T10:30:00Z"), fuelKg: 3200, onGround: false },
  { recordedAt: new Date("2026-07-21T11:00:00Z"), fuelKg: 2500, onGround: false },
  { recordedAt: new Date("2026-07-21T11:10:00Z"), fuelKg: 2300, onGround: true },
], []);
assert.equal(incompleteFuel.observedFuelUsedKg, 900);
assert.equal(incompleteFuel.fuelUsedKg, null);
assert.equal(incompleteFuel.fuelDataComplete, false);
assert.equal(incompleteFuel.fuelCoveragePercent, 57.1);

const leblToLepa = greatCircleDistanceNm(
  { latitude: 41.2971, longitude: 2.07846 },
  { latitude: 39.5517, longitude: 2.73881 },
);
assert.ok(leblToLepa !== null && leblToLepa >= 105 && leblToLepa <= 115);
assert.equal(greatCircleDistanceNm({ latitude: null, longitude: 2 }, { latitude: 39, longitude: 2 }), null);
assert.equal(nativePirepScore(-103), 100);
assert.equal(nativePirepScore(-400), 95);
assert.equal(nativePirepScore(-2300), 0);

validateTelemetryBatch({ currentPhase: "Cruise", positions: [{ sequenceNumber: 1, recordedAt: "2026-07-21T10:00:00Z", latitude: 40, longitude: -3, headingDegrees: 180, fuelKg: 5000 }] });
validateTelemetryBatch({ currentPhase: "Completed", completion: { initialFuelKg: 4400, finalFuelKg: 2562, fuelUsedKg: 1838, landingRateFeetPerMinute: -363 } });
assert.throws(() => validateTelemetryBatch({ currentPhase: "", positions: [] }), /phase/);
assert.throws(() => validateTelemetryBatch({ currentPhase: "Cruise", positions: [{ sequenceNumber: -1, recordedAt: "bad" }] }), /sequence/);
assert.throws(() => validateTelemetryBatch({ currentPhase: "Cruise", positions: [{ sequenceNumber: 1, recordedAt: "2026-07-21T10:00:00Z", latitude: 91 }] }), /latitude/);
assert.throws(() => validateTelemetryBatch({ currentPhase: "Cruise", positions: [{ sequenceNumber: 1, recordedAt: "2026-07-21T10:00:00Z", headingDegrees: 360 }] }), /heading/);
assert.throws(() => validateTelemetryBatch({ currentPhase: "Completed", completion: { fuelUsedKg: -1 } }), /completion fuel/);
console.log("ACARS completion rules passed.");
