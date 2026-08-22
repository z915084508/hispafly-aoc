import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAircraftType, validateNativePirep } from "./policy.ts";

const valid = { positionCount: 10, finalOnGround: true, currentPhase: "Arrived", authorizedAircraftType: "A21N", reportedAircraftType: "a21n", duplicate: false, flightTimeMinutes: 60, blockTimeMinutes: 75 };

test("R06 compares only normalized ICAO aircraft type", () => {
  assert.equal(normalizeAircraftType(" A21N "), "A21N");
  assert.deepEqual(validateNativePirep({ ...valid, reportedAircraftType: "B738" }), { status: "rejected", rejectCode: "R06", comment: "Reported ICAO aircraft type B738 does not match authorized type A21N." });
});
test("R03 is an automatic rejection", () => assert.equal(validateNativePirep({ ...valid, duplicate: true }).rejectCode, "R03"));
test("incomplete and inconsistent reports go to manual review", () => {
  assert.equal(validateNativePirep({ ...valid, finalOnGround: false }).status, "manual_review");
  assert.equal(validateNativePirep({ ...valid, blockTimeMinutes: 40 }).rejectCode, "R02");
});
test("a valid completed report is accepted", () => assert.equal(validateNativePirep(valid).status, "accepted"));
