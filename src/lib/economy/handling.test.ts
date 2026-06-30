import assert from "node:assert/strict";
import { handlingFeeForAircraft } from "./handling.ts";

const cases = [
  ["AT76", 1, 61_200], ["CRJX", 1, 61_200], ["B717", 2, 96_900],
  ["A320", 3, 131_000], ["B738", 3, 131_000], ["A321", 4, 150_200],
  ["B763", 5, 175_700], ["A359", 6, 175_700], ["B77W", 6, 175_700],
] as const;

for (const [aircraft, expectedClass, expectedCents] of cases) {
  const result = handlingFeeForAircraft(aircraft);
  assert.equal(result.handlingClass, expectedClass, `${aircraft} class`);
  assert.equal(result.amountCents, expectedCents, `${aircraft} fee`);
}

console.log(`Handling fees: ${cases.length} aircraft cases passed.`);
