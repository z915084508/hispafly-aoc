import assert from "node:assert/strict";
import { baseFuelDiscountPercent, calculateDispatchPayload, routeDemandClass, suggestedLoadFactor } from "./loadFactor.ts";

assert.equal(routeDemandClass("LEMD", "LEBL"), "BASE_TO_BASE");
assert.equal(routeDemandClass("LEVC", "EGLL"), "BASE_ROUTE");
assert.equal(baseFuelDiscountPercent("LEPA"), 21);
assert.equal(baseFuelDiscountPercent("EGLL"), 0);
assert.deepEqual(calculateDispatchPayload({ seats: 180, loadFactorPercent: 85, baggageKgPerPassenger: 23 }), { passengers: 153, luggageKg: 3519, baggageKgPerPassenger: 23 });
assert.equal(suggestedLoadFactor({ departure: "LEMD", arrival: "LEBL", departureAt: new Date("2026-07-05T08:00:00Z") }), 98);
console.log("HISPAFLY dispatch demand: 6 assertions passed.");
