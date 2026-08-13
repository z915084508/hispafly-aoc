import assert from "node:assert/strict";
import { rosterState } from "./rules.ts";

assert.equal(rosterState("CONFIRMED", "BOOKED"), "RESERVED");
assert.equal(rosterState("FLOWN", "COMPLETED"), "COMPLETED");
assert.equal(rosterState("CONFIRMED", "CANCELLED"), "CANCELLED");
console.log("Roster state contract passed.");
