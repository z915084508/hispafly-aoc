import assert from "node:assert/strict";
import { differencePercent, durationMinutes, efficiencyScore } from "./calculations.ts";

assert.equal(durationMinutes(5400), 90);
assert.equal(durationMinutes("01:30"), 90);
assert.equal(durationMinutes(95), 95);
assert.equal(differencePercent(5250, 5000), 5);
assert.equal(differencePercent(4500, 5000), -10);
assert.equal(differencePercent(100, 0), null);
assert.equal(efficiencyScore({ fuelDiffPercent: 0, blockTimeDiffMinutes: 0, landingRate: -200 }), 100);
assert.ok(efficiencyScore({ fuelDiffPercent: 10, blockTimeDiffMinutes: 15, landingRate: -500 }) < 100);
console.log("Flight analysis calculations: 8 assertions passed.");
