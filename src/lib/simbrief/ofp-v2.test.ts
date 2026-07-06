import assert from "node:assert/strict";
import { buildSimBriefGeneratePayload } from "./payload.ts";

const payload = buildSimBriefGeneratePayload({
  staticId: "HFAOC-dispatch-1",
  departureIcao: "levc",
  arrivalIcao: "lemd",
  aircraftType: "A320",
  flightNumber: "HF0200",
  callsign: null,
  aircraftRegistration: "EC-ABC",
  selectedDepartureAt: new Date("2026-07-06T12:30:00Z"),
  passengers: 150,
  freightKg: 800,
  cargoKg: 999,
  userRoute: null,
  altitude: 350,
});

assert.equal(payload.airline, "HPF");
assert.equal(payload.fltnum, "0200");
assert.equal(payload.callsign, "HPF0200");
assert.equal(payload.orig, "LEVC");
assert.equal(payload.dest, "LEMD");
assert.equal(payload.cargo, 800);
assert.equal(payload.planformat, "lido");
assert.equal(payload.units, "kgs");
assert.equal(payload.date, "6 Jul 2026 - 12:30");
assert.equal(payload.route, undefined);
assert.equal(payload.static_id, "HFAOC-dispatch-1");
assert.notEqual(payload.callsign, "HISPAFLY0200");

console.log("SimBrief OFP V2 payload: 12 assertions passed.");
