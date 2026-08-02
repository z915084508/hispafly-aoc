import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseScheduleValidationPayload } from "./payload.ts";

assert.equal(parseScheduleValidationPayload(null).ok, false, "malformed body must be rejected");
assert.equal(parseScheduleValidationPayload({ routeId: "route", daysOfWeek: "Monday" }).ok, false, "malformed days must be rejected");
assert.equal(parseScheduleValidationPayload({ routeId: "route", daysOfWeek: [1], departureTimeMinutesUtc: 480, arrivalTimeMinutesUtc: 540, scheduledDurationMinutes: 60, effectiveFrom: "2026-08-10T00:00:00.000Z" }).ok, true);

const routeSource = readFileSync(fileURLToPath(new URL("../../app/api/staff/operations/flight-schedules/validate/route.ts", import.meta.url)), "utf8");
assert.match(routeSource, /access === 401[\s\S]*status: 401/, "endpoint must reject missing staff authentication");
assert.match(routeSource, /access === 403[\s\S]*status: 403/, "endpoint must reject missing schedule permission");
assert.match(routeSource, /status: 400/, "endpoint must reject malformed payloads");
assert.match(routeSource, /validateProposedSchedule/, "endpoint must call the reusable validator");

console.log("Native scheduling validation endpoint contract passed (3 focused scenarios).");
