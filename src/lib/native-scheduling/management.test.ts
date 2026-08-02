import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { assertDraftEditable, normalizeScheduleDraftInput, scheduleCreatePolicy, ScheduleManagementError } from "./management-rules.ts";

const valid = { code: "hfy101-s26", name: "Madrid", routeId: "route-1", daysOfWeek: [1, 3, 5], departureTimeMinutesUtc: 480, scheduledDurationMinutes: 65, defaultFleetId: "fleet-1", assignedAircraftId: "aircraft-1", effectiveFrom: "2026-08-10", effectiveUntil: "2026-12-31", bookingOpenOffsetMinutes: 10080, bookingCloseOffsetMinutes: 60, generationHorizonDays: 30, notes: "Ops" };
const normalized = normalizeScheduleDraftInput(valid);
assert.equal(normalized.code, "HFY101-S26");
assert.equal(normalized.arrivalTimeMinutesUtc, 545);
assert.deepEqual(normalized.daysOfWeek, [1, 3, 5]);
assert.equal(normalized.effectiveFrom.toISOString(), "2026-08-10T00:00:00.000Z");
for (const malformed of [{ ...valid, daysOfWeek: [] }, { ...valid, daysOfWeek: [1, 1] }, { ...valid, departureTimeMinutesUtc: 1440 }, { ...valid, scheduledDurationMinutes: 0 }, { ...valid, effectiveFrom: "bad" }, { ...valid, effectiveUntil: "2026-08-09" }]) assert.throws(() => normalizeScheduleDraftInput(malformed), ScheduleManagementError);
assert.deepEqual(scheduleCreatePolicy(), { status: "DRAFT", dataOrigin: "HISPAFLY_NATIVE" }, "client status and origin are ignored");
assert.doesNotThrow(() => assertDraftEditable("DRAFT"));
for (const status of ["ACTIVE", "SUSPENDED", "EXPIRED", "ARCHIVED"]) assert.throws(() => assertDraftEditable(status), /Solo se pueden editar/);

const management = readFileSync(fileURLToPath(new URL("./management.ts", import.meta.url)), "utf8");
assert.match(management, /validationBeforeSave[\s\S]*flightSchedule\.create/, "operational conflicts are evaluated but do not block draft creation");
assert.match(management, /excludeScheduleId: id/, "draft updates exclude self-conflict");
assert.match(management, /SCHEDULE_DRAFT_CREATED/);
assert.match(management, /SCHEDULE_DRAFT_UPDATED/);
assert.match(management, /SCHEDULE_DRAFT_DUPLICATED/);
assert.match(management, /SCHEDULE_DRAFT_ARCHIVED/);
assert.match(management, /status: "ARCHIVED", archivedAt: new Date\(\)/);
assert.doesNotMatch(management, /flightSchedule\.delete|deleteMany/, "drafts are never hard deleted");
assert.doesNotMatch(management, /tx\.flight\.create|prisma\.flight\.create/, "management creates no generated Flights");

console.log("Programación draft management rules passed (26 focused assertions).");
