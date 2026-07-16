import assert from "node:assert/strict";
import{canChangeReleasedDispatch,summarizeDispatchChecks}from"./dispatch-rules.ts";
assert.equal(summarizeDispatchChecks([{key:"aircraft",status:"PASS"},{key:"weather",status:"WARNING"}]).releasable,true);
assert.equal(summarizeDispatchChecks([{key:"maintenance",status:"UNKNOWN",critical:true}]).releasable,false);
assert.equal(summarizeDispatchChecks([{key:"ofp",status:"BLOCK"}]).riskLevel,"BLOCKED");
assert.equal(canChangeReleasedDispatch("RELEASED"),false);
console.log("Native Dispatch rules passed.");
