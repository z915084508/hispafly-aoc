import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const form = readFileSync(fileURLToPath(new URL("../../components/native-self-dispatch-form.tsx", import.meta.url)), "utf8");
const action = readFileSync(fileURLToPath(new URL("../../app/pilot/flight-offers/self-dispatch/actions.ts", import.meta.url)), "utf8");
const service = readFileSync(fileURLToPath(new URL("../native-flight/self-dispatch.ts", import.meta.url)), "utf8");

assert.match(form, /name="departureAt" value=\{departureAt\} onChange=\{\(event\) => setDepartureAt\(event\.target\.value\)\}/);
assert.doesNotMatch(form, /setDepartureAt\(event\.target\.value\); clearAmnAllocation\(\)/);
assert.doesNotMatch(form, /disabled=\{locked\} required\/>/);
assert.match(form, /Route and aircraft remain locked while the AMN payload hold is active\. Departure time may still be adjusted\./);
assert.match(form, /Scheduled departure is no longer valid\. Select a new departure time to continue\./);
assert.doesNotMatch(action, /allocation\.operatingDate/);
assert.match(service, /operatingDate: input\.amnAllocation\.operatingDate/, "Persist the allocation day for confirmation without locking departure edits");
assert.doesNotMatch(service, /if\s*\([^\n]*amnAllocation\.operatingDate/, "Allocation day must not become a departure-time lock");
assert.match(action, /allocation\.routeId[\s\S]*allocation\.aircraftId/);
assert.match(service, /amnAllocation\.routeId[\s\S]*amnAllocation\.aircraftId/);

console.log("AMN Payload hold keeps route and aircraft locked while departure time remains editable.");
