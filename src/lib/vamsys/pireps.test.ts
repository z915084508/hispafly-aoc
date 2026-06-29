import assert from "node:assert/strict";
import { mapVamsysPirep } from "./pirepMapper.ts";
import { nextVamsysCursor, nextVamsysPageUrl } from "./pagination.ts";
import { isCompletedOperationsPirep, mergeOperationsPirepRecords, operationsPirepStatus } from "./operationsPirepPayload.ts";

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

assert.equal(nextVamsysCursor({ meta: { next_cursor: "history-2" } }), "history-2");
assert.equal(nextVamsysCursor({ meta: { nextCursor: "history-3" } }), "history-3");
assert.equal(nextVamsysCursor({ links: { next: "https://vamsys.io/api/v3/operations/pireps?page%5Bcursor%5D=history-4" } }), "history-4");
assert.equal(nextVamsysCursor({ links: { next: "/api/v3/operations/pireps?page%5Bcursor%5D=history-5" } }), "history-5");
assert.equal(nextVamsysCursor({ links: { next: null } }), null);
assert.equal(nextVamsysPageUrl({ meta: { next_cursor_url: "https://vamsys.io/api/v3/operations/pireps?page=2" } }), "https://vamsys.io/api/v3/operations/pireps?page=2");
assert.equal(nextVamsysPageUrl({ meta: { next_page_url: "/pireps?page=3" } }), "/pireps?page=3");
assert.equal(operationsPirepStatus({ attributes: { state: "Completed" } }), "completed");
assert.equal(isCompletedOperationsPirep({ attributes: { pirep_status: "APPROVED" } }), true);
assert.equal(isCompletedOperationsPirep({ attributes: { status: "rejected" } }), false);
const merged = mergeOperationsPirepRecords({ id: "P-200", attributes: { status: "accepted", pilot_id: "7" } }, { attributes: { flight_number: "HFY200" } });
assert.equal(merged.status, "accepted");
assert.equal(merged.flight_number, "HFY200");

console.log("vAMSYS PIREP mapper and pagination: 23 assertions passed");
