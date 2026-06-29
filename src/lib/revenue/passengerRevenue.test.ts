import assert from "node:assert/strict";
import { calculatePassengerRevenue, getDistanceFactor } from "./passengerRevenue.ts";

assert.equal(getDistanceFactor(0), 0.75);
assert.equal(getDistanceFactor(300), 0.75);
assert.equal(getDistanceFactor(301), 1);
assert.equal(getDistanceFactor(800), 1);
assert.equal(getDistanceFactor(801), 1.3);
assert.equal(getDistanceFactor(1501), 1.8);
assert.equal(getDistanceFactor(3001), 2.4);
assert.equal(getDistanceFactor(5001), 3);
assert.equal(calculatePassengerRevenue(189, 2450).revenueCredits, 27216);
assert.equal(calculatePassengerRevenue(189, 2450).revenueCents, 2721600);
assert.throws(() => calculatePassengerRevenue(-1, 100));
console.log("Passenger revenue engine: 11 assertions passed");
