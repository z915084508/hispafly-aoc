import assert from "node:assert/strict";
import { normalizeFlightIdentity } from "./flightIdentity.ts";

assert.deepEqual(normalizeFlightIdentity({ flightNumber: "HF0200", callsign: null }), {
  commercialFlightNumber: "HF0200", atcCallsign: "HPF0200", numericFlightNumber: "0200", airlineName: "HISPAFLY",
});
assert.deepEqual(normalizeFlightIdentity({ flightNumber: "0200", callsign: null }), {
  commercialFlightNumber: "HF0200", atcCallsign: "HPF0200", numericFlightNumber: "0200", airlineName: "HISPAFLY",
});
assert.deepEqual(normalizeFlightIdentity({ flightNumber: "HF123", callsign: "HPF777" }), {
  commercialFlightNumber: "HF123", atcCallsign: "HPF777", numericFlightNumber: "123", airlineName: "HISPAFLY",
});
assert.equal(normalizeFlightIdentity({ flightNumber: "HISPAFLY0200", callsign: "HISPAFLY0200" }).atcCallsign, "HPF0200");
console.log("Flight identity: 4 assertions passed.");
