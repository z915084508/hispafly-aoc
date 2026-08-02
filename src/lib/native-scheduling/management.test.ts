import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { assertDraftEditable, normalizeScheduleDraftInput, scheduleCreatePolicy, ScheduleManagementError } from "./management-rules.ts";
import { deriveReturnScheduleDraft } from "./return-draft.ts";

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

const returnDraft = deriveReturnScheduleDraft(normalized, { code: "hfy102-s26", routeId: "route-2", turnaroundMinutes: 45, scheduledDurationMinutes: 70 });
assert.equal(returnDraft.code, "HFY102-S26");
assert.equal(returnDraft.routeId, "route-2");
assert.equal(returnDraft.departureTimeMinutesUtc, 590, "return departs after outbound arrival plus turnaround");
assert.equal(returnDraft.arrivalTimeMinutesUtc, 660);
assert.deepEqual(returnDraft.daysOfWeek, [1, 3, 5], "same-day return keeps operating days");
assert.equal(returnDraft.assignedAircraftId, normalized.assignedAircraftId);
assert.equal(returnDraft.defaultFleetId, normalized.defaultFleetId);
assert.equal(returnDraft.effectiveFrom, normalized.effectiveFrom);

const overnightOutbound = normalizeScheduleDraftInput({ ...valid, code: "HFY900", daysOfWeek: [1, 7], departureTimeMinutesUtc: 1410, scheduledDurationMinutes: 120 });
const overnightReturn = deriveReturnScheduleDraft(overnightOutbound, { code: "HFY901", routeId: "route-2", turnaroundMinutes: 45, scheduledDurationMinutes: 120 });
assert.equal(overnightReturn.departureTimeMinutesUtc, 135);
assert.deepEqual(overnightReturn.daysOfWeek, [1, 2], "overnight return shifts Sunday to Monday and Monday to Tuesday");
assert.throws(() => deriveReturnScheduleDraft(normalized, { code: normalized.code, routeId: "route-2", turnaroundMinutes: 45, scheduledDurationMinutes: 70 }), /códigos diferentes/);
assert.throws(() => deriveReturnScheduleDraft(normalized, { code: "HFY102", routeId: "route-2", turnaroundMinutes: 44, scheduledDurationMinutes: 70 }), /45/);

const management = readFileSync(fileURLToPath(new URL("./management.ts", import.meta.url)), "utf8");
const actions = readFileSync(fileURLToPath(new URL("../../app/staff/operations/programacion/actions.ts", import.meta.url)), "utf8");
const form = readFileSync(fileURLToPath(new URL("../../components/programacion/schedule-form.tsx", import.meta.url)), "utf8");
assert.match(management, /validationBeforeSave[\s\S]*flightSchedule\.create/, "operational conflicts are evaluated but do not block draft creation");
assert.match(management, /excludeScheduleId: id/, "draft updates exclude self-conflict");
assert.match(management, /createFlightScheduleDraftPair/);
assert.match(management, /RETURN_ROUTE_NOT_REVERSE/);
assert.match(management, /outboundSchedule[\s\S]*returnSchedule[\s\S]*\$transaction|\$transaction[\s\S]*outboundSchedule[\s\S]*returnSchedule/, "outbound and return drafts share one transaction");
assert.match(management, /pairedScheduleId/);
assert.match(actions, /createReturn/);
assert.match(actions, /returnRouteId/);
assert.match(actions, /createFlightScheduleDraftPair/);
assert.match(form, /Crear también el vuelo de regreso/);
assert.match(form, /Guardar ida y regreso/);
assert.match(form, /returnTurnaroundMinutes/);
assert.match(management, /SCHEDULE_DRAFT_CREATED/);
assert.match(management, /SCHEDULE_DRAFT_UPDATED/);
assert.match(management, /SCHEDULE_DRAFT_DUPLICATED/);
assert.match(management, /SCHEDULE_DRAFT_ARCHIVED/);
assert.match(management, /status: "ARCHIVED", archivedAt: new Date\(\)/);
assert.doesNotMatch(management, /flightSchedule\.delete|deleteMany/, "drafts are never hard deleted");
assert.doesNotMatch(management, /tx\.flight\.create|prisma\.flight\.create/, "management creates no generated Flights");
for (const forbidden of ["pilotBooking.create", "flightDispatch.create", "ofpBriefing.create"]) assert.doesNotMatch(management + actions, new RegExp(forbidden, "i"));

console.log("Programación draft management and return-pair rules passed (43 focused assertions).");
