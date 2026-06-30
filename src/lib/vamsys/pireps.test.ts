import assert from "node:assert/strict";
import { nextVamsysCursor, nextVamsysPageUrl } from "./pagination.ts";
import { isCompletedOperationsPirep, mergeOperationsPirepRecords, operationsPirepStatus } from "./operationsPirepPayload.ts";
import { mapOperationsPirep } from "./operationsPireps.ts";

assert.equal(nextVamsysCursor({ meta: { next_cursor: "abc" } }), "abc");
assert.equal(nextVamsysCursor({ links: { next: "https://api.example.test/pireps?page%5Bcursor%5D=def" } }), "def");
assert.equal(nextVamsysPageUrl({ meta: { next_cursor_url: "https://api.example.test/pireps?page[cursor]=ghi" } }), "https://api.example.test/pireps?page[cursor]=ghi");
assert.equal(nextVamsysPageUrl({ meta: { next_page_url: "https://api.example.test/pireps?page=2" } }), "https://api.example.test/pireps?page=2");
assert.equal(nextVamsysPageUrl({ links: { next: "https://api.example.test/pireps?page=3" } }), "https://api.example.test/pireps?page=3");

assert.equal(operationsPirepStatus({ attributes: { status: "APPROVED" } }), "approved");
assert.equal(operationsPirepStatus({ attributes: { state: "completed" } }), "completed");
assert.equal(operationsPirepStatus({ attributes: { pirep_status: "accepted" } }), "accepted");
assert.equal(isCompletedOperationsPirep({ attributes: { status: "rejected" } }), false);
assert.equal(isCompletedOperationsPirep({ attributes: { status: "completed" } }), true);

const merged = mergeOperationsPirepRecords(
  { id: "P-200", attributes: { status: "accepted", pilot_id: "7" } },
  { attributes: { flight_number: "HFY200" } },
);
assert.equal(merged.pilot_id, "7");
assert.equal(merged.flight_number, "HFY200");
assert.deepEqual(merged.attributes, { status: "accepted", pilot_id: "7", flight_number: "HFY200" });

const mapped = mapOperationsPirep({
  id: "P-201",
  attributes: {
    status: "completed",
    pilot_id: "42",
    flight_number: "HFY201",
    callsign: "HFY201",
    booking_id: 98765,
    departure_airport_id: "LEMD",
    arrival_airport_id: "LEBL",
    aircraft_type: "A320",
    network: "VATSIM",
    flight_length: 7200,
    block_length: 7500,
    landing_rate: -180,
    score: 98,
    fuel_used: 4200,
    landing_time: "2026-06-29T12:00:00.000Z",
  },
});
assert.equal(mapped.pilotExternalId, "42");
assert.equal(mapped.data.vamsysPirepId, "P-201");
assert.equal(mapped.data.vamsysBookingId, "98765");
assert.equal(mapped.data.flightTimeMinutes, 120);
assert.equal(mapped.data.status, "accepted");

console.log("vAMSYS PIREP mapper and pagination: 19 assertions passed.");
