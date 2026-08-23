import assert from "node:assert/strict";import {calculatePirepScore,DEFAULT_SCORING_RULES} from "./scoring.ts";
const policy={id:"test",scopeKey:"GLOBAL",name:"Test",operationalWeight:70,efficiencyWeight:30,startingScore:100,version:1,rules:DEFAULT_SCORING_RULES};
const clean=calculatePirepScore(policy,[],80);assert.equal(clean.operationalScore,100);assert.equal(clean.totalScore,94);
const overspeed=calculatePirepScore(policy,["OVERSPEED"],80);assert.equal(overspeed.operationalScore,90);assert.equal(overspeed.totalScore,87);
const integrityPolicy={...policy,rules:policy.rules.map(rule=>rule.code==="MID_AIR_REFUELING"?{...rule,enabled:true}:rule)};const integrity=calculatePirepScore(integrityPolicy,["MID_AIR_REFUELING"],100);assert.equal(integrity.invalidated,true);
const review=calculatePirepScore(policy,["TIME_ACCELERATION"],100);assert.equal(review.requiresReview,true);
console.log("PIREP scoring: 4 focused assertions passed.");
