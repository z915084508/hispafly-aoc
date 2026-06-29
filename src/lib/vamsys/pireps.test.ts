import assert from "node:assert/strict";
import { mapVamsysPirep } from "./pirepMapper.ts";

const complete = mapVamsysPirep({ id: "P-100", attributes: { status: "accepted", flight_number: "HSF100", callsign: "HSF100", departure: { icao: "LEMD" }, arrival: { icao: "LEBL" }, aircraft: { icao: "A320" }, network: "VATSIM", flight_time: "01:25", block_time: "01:42:30", landing_rate: "-180", score: 97, fuel_used: 4100, created_at: "2026-06-29T10:00:00Z" } });
assert.equal(complete.vamsysPirepId, "P-100");
assert.equal(complete.departure, "LEMD");
assert.equal(complete.arrival, "LEBL");
assert.equal(complete.aircraftType, "A320");
assert.equal(complete.flightTimeMinutes, 85);
assert.equal(complete.blockTimeMinutes, 103);
assert.equal(complete.landingRate, -180);

const sparse = mapVamsysPirep({ id: "P-101", status: "accepted" });
assert.equal(sparse.flightNumber, null);
assert.equal(sparse.flownAt, null);
assert.throws(() => mapVamsysPirep({ id: "P-102", status: "rejected" }), /no aceptado/);
assert.throws(() => mapVamsysPirep({ status: "accepted" }), /sin identificador/);

console.log("vAMSYS PIREP mapper: 11 assertions passed");
