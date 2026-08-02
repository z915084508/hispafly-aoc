import assert from "node:assert/strict";
import { buildSimBriefGeneratePayload } from "./payload.ts";
import { resolveSimbriefDispatchLoad } from "./load.ts";

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

const generatedLoad = resolveSimbriefDispatchLoad({
  passengers: null,
  loadFactorPercent: null,
  baggageKgPerPassenger: null,
  luggageKg: null,
  seatCapacity: 180,
  departureIcao: "LEMG",
  arrivalIcao: "LEMD",
  departureAt: new Date("2026-09-14T12:00:00Z"),
});
assert.equal(generatedLoad.loadFactorPercent, 76);
assert.equal(generatedLoad.passengers, 137);
assert.equal(generatedLoad.baggageKgPerPassenger, 23);
assert.equal(generatedLoad.luggageKg, 3151);
assert.equal(generatedLoad.generated, true);

const existingLoad = resolveSimbriefDispatchLoad({
  passengers: 0,
  loadFactorPercent: null,
  baggageKgPerPassenger: null,
  luggageKg: null,
  seatCapacity: null,
  departureIcao: "LEMG",
  arrivalIcao: "LEMD",
  departureAt: new Date("2026-09-14T12:00:00Z"),
});
assert.equal(existingLoad.passengers, 0);
assert.equal(existingLoad.generated, false);

assert.throws(() => resolveSimbriefDispatchLoad({
  passengers: null,
  loadFactorPercent: null,
  baggageKgPerPassenger: null,
  luggageKg: null,
  seatCapacity: null,
  departureIcao: "LEMG",
  arrivalIcao: "LEMD",
  departureAt: new Date("2026-09-14T12:00:00Z"),
}), /seat capacity/i);

console.log("SimBrief OFP V2 payload and passenger load: 20 assertions passed.");
