import assert from "node:assert/strict";
import {
  buildRoutePairCode,
  classifyRouteMarket,
  estimateBlockMinutes,
  greatCircleDistanceNm,
  nextRouteIdentities,
  normalizeCountryCode,
} from "./route-automation.ts";

assert.equal(normalizeCountryCode("España"), "ES");
assert.equal(normalizeCountryCode("United Kingdom"), "GB");
assert.equal(normalizeCountryCode("RO"), "RO");

assert.equal(classifyRouteMarket({ country: "Spain" }, { country: "ES" }), "DOMESTIC");
assert.equal(classifyRouteMarket({ country: "Spain" }, { country: "France" }), "SCHENGEN");
assert.equal(classifyRouteMarket({ country: "Spain" }, { country: "Romania" }), "SCHENGEN");
assert.equal(classifyRouteMarket({ country: "Spain" }, { country: "United Kingdom" }), "NON_SCHENGEN");
assert.equal(classifyRouteMarket({ country: "Spain" }, { country: "Cyprus" }), "NON_SCHENGEN");
assert.throws(() => classifyRouteMarket({ country: null }, { country: "Spain" }), /recognizable country/);

assert.deepEqual(nextRouteIdentities("DOMESTIC", [], true), {
  marketType: "DOMESTIC",
  outbound: { number: 1000, flightNumber: "HF1000", callsign: "HPF1000" },
  return: { number: 1001, flightNumber: "HF1001", callsign: "HPF1001" },
});
assert.deepEqual(nextRouteIdentities("SCHENGEN", [
  { flightNumber: "HF3000" },
  { callsign: "HPF3001" },
], true).outbound.flightNumber, "HF3002");
assert.equal(nextRouteIdentities("NON_SCHENGEN", [{ flightNumber: "HF6000" }]).outbound.flightNumber, "HF6001");

assert.equal(buildRoutePairCode({ iata: "MAD", icao: "LEMD" }, { iata: "VLC", icao: "LEVC" }), "MAD-VLC");
assert.equal(buildRoutePairCode({ iata: null, icao: "LEMD" }, { iata: null, icao: "LEVC" }), "LEMD-LEVC");

const distance = greatCircleDistanceNm(
  { latitude: 40.4722, longitude: -3.5608 },
  { latitude: 39.4893, longitude: -0.4816 },
);
assert.equal(distance > 150 && distance < 180, true);
assert.equal(estimateBlockMinutes(distance, 430) % 5, 0);
assert.equal(estimateBlockMinutes(1, 430), 35);

console.log("Automatic Native route identity tests passed.");
