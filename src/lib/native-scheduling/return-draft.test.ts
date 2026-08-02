import assert from "node:assert/strict";
import { normalizeScheduleDraftInput } from "./management-rules.ts";
import { deriveReturnScheduleDraft } from "./return-draft.ts";

const outbound = normalizeScheduleDraftInput({
  code: "HF001B",
  routeId: "levc-lpma",
  daysOfWeek: [1, 3, 5, 7],
  departureTimeMinutesUtc: 645,
  scheduledDurationMinutes: 169,
  defaultFleetId: "a320",
  assignedAircraftId: "ec-oma",
  effectiveFrom: "2026-07-27",
  effectiveUntil: "",
  bookingOpenOffsetMinutes: 10080,
  bookingCloseOffsetMinutes: 60,
  generationHorizonDays: 30,
});

const returnFlight = deriveReturnScheduleDraft(outbound, {
  code: "HF001C",
  routeId: "lpma-levc",
  turnaroundMinutes: 45,
  scheduledDurationMinutes: 165,
});

assert.equal(returnFlight.departureTimeMinutesUtc, 859, "10:45 + 02:49 + 00:45 = 14:19 UTC");
assert.equal(returnFlight.arrivalTimeMinutesUtc, 1024);
assert.deepEqual(returnFlight.daysOfWeek, [1, 3, 5, 7]);
assert.equal(returnFlight.assignedAircraftId, "ec-oma");
assert.equal(returnFlight.defaultFleetId, "a320");

const overnight = deriveReturnScheduleDraft(normalizeScheduleDraftInput({
  ...outbound,
  code: "HF900",
  daysOfWeek: [7],
  departureTimeMinutesUtc: 1380,
  scheduledDurationMinutes: 180,
  effectiveFrom: "2026-07-27",
}), {
  code: "HF901",
  routeId: "return",
  turnaroundMinutes: 60,
  scheduledDurationMinutes: 120,
});
assert.equal(overnight.departureTimeMinutesUtc, 180);
assert.deepEqual(overnight.daysOfWeek, [1], "Sunday overnight arrival shifts return to Monday");

console.log("Optional return schedule calculations passed.");
