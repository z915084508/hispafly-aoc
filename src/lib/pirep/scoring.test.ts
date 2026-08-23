import assert from "node:assert/strict";import {calculatePirepScore,DEFAULT_SCORING_RULES} from "./scoring.ts";
const policy={id:"test",scopeKey:"GLOBAL",name:"Test",operationalWeight:70,efficiencyWeight:30,startingScore:100,version:1,rules:DEFAULT_SCORING_RULES};
const clean=calculatePirepScore(policy,[],80);assert.equal(clean.operationalScore,100);assert.equal(clean.totalScore,94);
const overspeed=calculatePirepScore(policy,["OVERSPEED"],80);assert.equal(overspeed.operationalScore,90);assert.equal(overspeed.totalScore,87);
const integrityPolicy={...policy,rules:policy.rules.map(rule=>rule.code==="MID_AIR_REFUELING"?{...rule,enabled:true}:rule)};const integrity=calculatePirepScore(integrityPolicy,["MID_AIR_REFUELING"],100);assert.equal(integrity.invalidated,true);
const review=calculatePirepScore(policy,["TIME_ACCELERATION"],100);assert.equal(review.requiresReview,true);
const landing=calculatePirepScore(policy,[],100,{landingG:1.72});assert.equal((landing.details as {appliedRules:Array<{code:string}>}).appliedRules[0].code,"LANDING_G_VERY_HARD");assert.equal(landing.operationalScore,75);
console.log("PIREP scoring: 6 focused assertions passed.");
