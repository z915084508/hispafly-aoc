import assert from "node:assert/strict";
import { classifyRecord, uniqueExactCandidate } from "./classification.ts";

assert.equal(classifyRecord({ origin: "HISPAFLY_NATIVE", internalIdentityComplete: true }), "NATIVE_READY");
assert.equal(classifyRecord({ origin: "VAMSYS_LEGACY", internalIdentityComplete: true, uniquelyLinked: true }), "LEGACY_LINKED");
assert.equal(classifyRecord({ origin: "VAMSYS_LEGACY", internalIdentityComplete: false }), "LEGACY_UNRESOLVED");
assert.equal(classifyRecord({ origin: "VAMSYS_LEGACY", internalIdentityComplete: false, historicalOnly: true }), "LEGACY_HISTORICAL_ONLY");
assert.equal(classifyRecord({ origin: "HISPAFLY_NATIVE", internalIdentityComplete: false, invalid: true }), "INVALID_REQUIRES_REVIEW");
assert.equal(uniqueExactCandidate([{ id: "one" }])?.id, "one");
assert.equal(uniqueExactCandidate([{ id: "one" }, { id: "two" }]), null);
console.log("Native cutover classification rules passed.");
