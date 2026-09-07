import assert from "node:assert/strict";
import { normalizeAmnRegistration, resolveAmnAircraftTypeCode } from "./flight-context-normalization.ts";

assert.equal(normalizeAmnRegistration(""), null);
assert.equal(normalizeAmnRegistration("  "), null);
assert.equal(normalizeAmnRegistration(null), null);
assert.equal(normalizeAmnRegistration(" ec-abc "), "EC-ABC");
assert.equal(resolveAmnAircraftTypeCode({ fleet: { type: "PAX", iataType: "32N", code: "A20N" } }), "32N");
assert.equal(resolveAmnAircraftTypeCode({ assignedAircraft: { aircraftType: "A320-214" }, fleet: null }), "A320");

console.log("AMN flight context normalization: blank registrations and generic fleet labels passed.");
