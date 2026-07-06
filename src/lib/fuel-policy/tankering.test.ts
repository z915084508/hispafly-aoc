import assert from "node:assert/strict";
import { calculateTankeringRecommendation } from "./tankering.ts";

assert.deepEqual(calculateTankeringRecommendation({ departurePricePerKgCents: 80, arrivalPricePerKgCents: 100, fuelCapacityMarginKg: 1800, takeoffWeightMarginKg: 1400, landingWeightMarginKg: 900 }), { recommendedKg: 900, estimatedSavingCents: 18000, priceDifferencePerKgCents: 20 });
assert.equal(calculateTankeringRecommendation({ departurePricePerKgCents: 100, arrivalPricePerKgCents: 80, fuelCapacityMarginKg: 1000, takeoffWeightMarginKg: 1000, landingWeightMarginKg: 1000 }), null);
assert.equal(calculateTankeringRecommendation({ departurePricePerKgCents: 80, arrivalPricePerKgCents: 100, fuelCapacityMarginKg: 50, takeoffWeightMarginKg: 1000, landingWeightMarginKg: 1000 }), null);
console.log("Fuel tankering recommendation: 3 assertions passed.");
