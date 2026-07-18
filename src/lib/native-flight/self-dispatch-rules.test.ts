import assert from "node:assert/strict";
import { fleetIsAuthorized, validateSelfDispatchWindow } from "./self-dispatch-rules.ts";

const now = new Date("2026-07-19T10:00:00Z");
assert.match(validateSelfDispatchWindow(new Date("2026-07-19T10:10:00Z"), now) ?? "", /15 minutes/);
assert.equal(validateSelfDispatchWindow(new Date("2026-07-19T10:15:00Z"), now), null);
assert.match(validateSelfDispatchWindow(new Date("2026-08-20T10:00:00Z"), now) ?? "", /30 days/);
assert.equal(fleetIsAuthorized([], "fleet-a"), true);
assert.equal(fleetIsAuthorized(["fleet-a"], "fleet-a"), true);
assert.equal(fleetIsAuthorized(["fleet-a"], "fleet-b"), false);
assert.equal(fleetIsAuthorized(["fleet-a"], null), false);
console.log("Native self-dispatch rules passed.");
