import assert from "node:assert/strict";
import { evaluateCaptainEligibility, type CaptainEligibilityEvidence } from "./eligibility.ts";

const now = new Date("2026-08-27T00:00:00Z");
const eligible: CaptainEligibilityEvidence = {
  pilotActive: true, accountActive: true, currentRank: "SFO",
  acceptedMinutes: 18_000, acceptedSectors: 150, recent90DayAcceptedSectors: 10,
  last12MonthTotalPireps: 100, last12MonthAcceptedPireps: 96,
  last30FlightSafetyScore: 90, last30FlightSopScore: 88,
  openManualReviewPireps: 0, recentCriticalEvents: 0,
  recentUnresolvedMajorEvents: 0, activePromotionRestrictions: 0,
  commandAssessment: { commandScore: 85, recommendation: "RECOMMENDED", validUntil: new Date("2027-01-01T00:00:00Z") },
};

assert.equal(evaluateCaptainEligibility(eligible, now).status, "ELIGIBLE");
assert.deepEqual(evaluateCaptainEligibility({ ...eligible, recentCriticalEvents: 1 }, now).blockers, ["RECENT_CRITICAL_EVENT"]);
assert.equal(evaluateCaptainEligibility({ ...eligible, recentUnresolvedMajorEvents: 1 }, now).status, "REVIEW_REQUIRED");
assert.equal(evaluateCaptainEligibility({ ...eligible, currentRank: "FO" }, now).status, "NOT_ELIGIBLE");
assert.equal(evaluateCaptainEligibility({ ...eligible, last30FlightSafetyScore: null }, now).status, "NOT_ELIGIBLE");
assert.equal(evaluateCaptainEligibility({ ...eligible, commandAssessment: { ...eligible.commandAssessment!, validUntil: now } }, now).status, "NOT_ELIGIBLE");

console.log("Captain eligibility policy tests passed.");
