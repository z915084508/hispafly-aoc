import assert from "node:assert/strict";
import { derivePirepRejectionRiskSignal } from "./pirep-signals.ts";

assert.equal(derivePirepRejectionRiskSignal({pilotId:"p",pirepId:"x",rejectCode:"R03"}),null);
assert.equal(derivePirepRejectionRiskSignal({pilotId:"p",pirepId:"x",rejectCode:"R07"})?.severity,"CRITICAL");
assert.equal(derivePirepRejectionRiskSignal({pilotId:"p",pirepId:"x",rejectCode:"R08",staffComment:"Serious SOP violation"})?.severity,"HIGH");
assert.equal(derivePirepRejectionRiskSignal({pilotId:"p",pirepId:"x",rejectCode:"R04"})?.severity,"MODERATE");

console.log("PIREP risk mapping tests passed.");
