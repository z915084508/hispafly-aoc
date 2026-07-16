import assert from "node:assert/strict";
import { planScheduleOccurrences } from "./schedule-rules.ts";
import { resolveLocalDateTime } from "./schedule-time.ts";

const madridSummer = resolveLocalDateTime({ year: 2026, month: 7, day: 16 }, 10 * 60, "Europe/Madrid");
assert.equal(madridSummer.ok, true);
if (madridSummer.ok) assert.equal(madridSummer.instant.toISOString(), "2026-07-16T08:00:00.000Z");

assert.equal(
  resolveLocalDateTime({ year: 2026, month: 3, day: 29 }, 2 * 60 + 30, "Europe/Madrid").ok,
  false,
  "DST spring-forward time must be rejected",
);
assert.equal(
  resolveLocalDateTime({ year: 2026, month: 10, day: 25 }, 2 * 60 + 30, "Europe/Madrid").ok,
  false,
  "DST repeated time must require an explicit correction",
);

const occurrences = planScheduleOccurrences({
  scheduleId: "schedule-1",
  daysOfWeek: [4],
  departureLocalTimeMinutes: 23 * 60 + 30,
  departureTimezone: "Europe/Madrid",
  arrivalTimezone: "Europe/London",
  scheduledDurationMinutes: 150,
  effectiveFrom: "2026-07-01",
  from: "2026-07-16",
  to: "2026-07-16",
});
assert.equal(occurrences.length, 1);
assert.equal(occurrences[0]?.ok, true);
if (occurrences[0]?.ok) {
  assert.equal(occurrences[0].operatingDate, "2026-07-16");
  assert.equal(occurrences[0].scheduledArrival.toISOString(), "2026-07-17T00:00:00.000Z");
}

console.log("Native schedule time-zone rules passed.");
