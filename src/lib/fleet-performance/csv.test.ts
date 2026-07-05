import assert from "node:assert/strict";
import { createPerformanceCsv, parsePerformanceCsv } from "./csv.ts";

const csv = createPerformanceCsv([{ fleetKey: "ID:fleet-1", fleetName: "A320 Fleet", aircraftType: "A320", aircraftCount: 4, seatCapacity: 180, cargoCapacityKg: 9500, operatingEmptyWeightKg: 42600, fuelBiasPercent: -1.2, locked: "TRUE", notes: "Test, quoted" }]);
const [row] = parsePerformanceCsv(csv);
assert.equal(row.fleetKey, "ID:fleet-1");
assert.equal(row.operatingEmptyWeightKg, "42600");
assert.equal(row.seatCapacity, "180");
assert.equal(row.cargoCapacityKg, "9500");
assert.equal(row.fuelBiasPercent, "-1.2");
assert.equal(row.notes, "Test, quoted");
assert.throws(() => parsePerformanceCsv("aircraftId,registration\na,b"), /Missing columns/);
console.log("Fleet performance CSV tests passed.");
