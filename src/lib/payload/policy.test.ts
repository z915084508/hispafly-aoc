import assert from "node:assert/strict";
import { HISPAFLY_PAYLOAD_POLICY, passengerBaggageWeight } from "./policy.ts";

assert.equal(HISPAFLY_PAYLOAD_POLICY.policyId, "HISPAFLY_PAYLOAD_POLICY_V1");
assert.equal(HISPAFLY_PAYLOAD_POLICY.baggageKgPerPassenger, 23);
assert.equal(HISPAFLY_PAYLOAD_POLICY.source, "AIRLINE_POLICY");
assert.equal(passengerBaggageWeight(100), 2300);
assert.equal(passengerBaggageWeight(153, 23), 3519);
assert.throws(() => passengerBaggageWeight(-1));
console.log("HISPAFLY Payload Policy: airline-owned 23 kg passenger baggage default validated.");
