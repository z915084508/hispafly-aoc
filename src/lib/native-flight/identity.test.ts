import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeCode, normalizeIata, normalizeIcao, normalizeRegistration } from "./normalize.ts";

assert.equal(normalizeIcao(" levc "), "LEVC");
assert.equal(normalizeIata("vlc"), "VLC");
assert.equal(normalizeRegistration(" ec abc "), "ECABC");
assert.equal(normalizeCode("hsp-101", "Route code"), "HSP-101");
assert.throws(() => normalizeIcao("LE"));
assert.throws(() => normalizeRegistration("**"));

const schema = readFileSync(new URL("../../../prisma/schema.prisma", import.meta.url), "utf8");
for (const model of ["Airport", "Route", "Fleet", "Aircraft", "FlightSchedule", "Flight", "PilotBooking", "FlightDispatch"]) {
  assert.match(schema, new RegExp(`model ${model} \\{`), `${model} must have a native model`);
}
assert.match(schema, /vamsysAircraftId\s+String\?\s+@unique/);
assert.match(schema, /vamsysBookingId\s+String\?\s+@unique/);
assert.match(schema, /@@unique\(\[pilotId, flightId\]\)/);
assert.match(schema, /departureAirport\s+Airport\?/);
assert.match(schema, /assignedAircraft\s+Aircraft\?/);

console.log("Native flight identity foundation tests passed.");
