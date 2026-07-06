import assert from "node:assert/strict";
import { aircraftConditionReleaseStatus, overallDispatchReleaseStatus } from "./rules.ts";

assert.equal(aircraftConditionReleaseStatus("AOG", false), "BLOCKED");
assert.equal(aircraftConditionReleaseStatus("IN_MAINTENANCE", false), "BLOCKED");
assert.equal(aircraftConditionReleaseStatus("FERRY_ONLY", false), "BLOCKED");
assert.equal(aircraftConditionReleaseStatus("FERRY_ONLY", true), "OK");
assert.equal(aircraftConditionReleaseStatus("CAUTION", false), "WARNING");
assert.equal(aircraftConditionReleaseStatus("NORMAL", false), "OK");
assert.equal(aircraftConditionReleaseStatus(null, false), "BLOCKED");
assert.equal(overallDispatchReleaseStatus({ voided: false, blockingCount: 1, signed: true, generated: true }), "BLOCKED");
assert.equal(overallDispatchReleaseStatus({ voided: false, blockingCount: 0, signed: false, generated: true }), "READY");
assert.equal(overallDispatchReleaseStatus({ voided: false, blockingCount: 0, signed: true, generated: true }), "SIGNED");

console.log("Dispatch Release rules: 10 assertions passed.");
