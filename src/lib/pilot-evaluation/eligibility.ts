export const CAPTAIN_ELIGIBILITY_POLICY_VERSION = 1;

export type CaptainEligibilityEvidence = {
  pilotActive: boolean;
  accountActive: boolean;
  currentRank: string | null;
  acceptedMinutes: number;
  acceptedSectors: number;
  recent90DayAcceptedSectors: number;
  last12MonthTotalPireps: number;
  last12MonthAcceptedPireps: number;
  last30FlightSafetyScore: number | null;
  last30FlightSopScore: number | null;
  openManualReviewPireps: number;
  recentCriticalEvents: number;
  recentUnresolvedMajorEvents: number;
  activePromotionRestrictions: number;
  commandAssessment: {
    commandScore: number | null;
    recommendation: "NOT_RECOMMENDED" | "DEVELOPMENT_REQUIRED" | "RECOMMENDED" | "STRONGLY_RECOMMENDED";
    validUntil: Date | null;
  } | null;
};

export type EligibilityCheck = {
  code: string;
  label: string;
  passed: boolean;
  actual: number | string | boolean | null;
  required: number | string | boolean;
};

export type CaptainEligibilityResult = {
  status: "ELIGIBLE" | "NOT_ELIGIBLE" | "REVIEW_REQUIRED";
  targetRank: "CPT";
  policyVersion: number;
  checkedAt: Date;
  requirements: EligibilityCheck[];
  blockers: string[];
  warnings: string[];
};

export function evaluateCaptainEligibility(evidence: CaptainEligibilityEvidence, checkedAt = new Date()): CaptainEligibilityResult {
  const acceptanceRate = evidence.last12MonthTotalPireps
    ? evidence.last12MonthAcceptedPireps / evidence.last12MonthTotalPireps * 100
    : null;
  const assessmentValid = Boolean(evidence.commandAssessment?.validUntil && evidence.commandAssessment.validUntil > checkedAt);
  const requirements: EligibilityCheck[] = [
    { code: "PILOT_ACTIVE", label: "Pilot status is active", passed: evidence.pilotActive, actual: evidence.pilotActive, required: true },
    { code: "ACCOUNT_ACTIVE", label: "Local account is active", passed: evidence.accountActive, actual: evidence.accountActive, required: true },
    { code: "CURRENT_RANK", label: "Current rank is Senior First Officer", passed: evidence.currentRank === "SFO", actual: evidence.currentRank, required: "SFO" },
    { code: "ACCEPTED_HOURS", label: "Accepted HISPAFLY hours", passed: evidence.acceptedMinutes >= 18_000, actual: Math.round(evidence.acceptedMinutes / 6) / 10, required: 300 },
    { code: "ACCEPTED_SECTORS", label: "Accepted sectors", passed: evidence.acceptedSectors >= 150, actual: evidence.acceptedSectors, required: 150 },
    { code: "RECENT_ACTIVITY", label: "Accepted sectors in the last 90 days", passed: evidence.recent90DayAcceptedSectors >= 10, actual: evidence.recent90DayAcceptedSectors, required: 10 },
    { code: "ACCEPTANCE_RATE", label: "PIREP acceptance rate in the last 12 months", passed: acceptanceRate !== null && acceptanceRate >= 95, actual: acceptanceRate === null ? null : Math.round(acceptanceRate * 10) / 10, required: 95 },
    { code: "SAFETY_SCORE", label: "Safety score over the last 30 flights", passed: evidence.last30FlightSafetyScore !== null && evidence.last30FlightSafetyScore >= 85, actual: evidence.last30FlightSafetyScore, required: 85 },
    { code: "SOP_SCORE", label: "SOP score over the last 30 flights", passed: evidence.last30FlightSopScore !== null && evidence.last30FlightSopScore >= 80, actual: evidence.last30FlightSopScore, required: 80 },
    { code: "COMMAND_ASSESSMENT", label: "Valid command assessment", passed: assessmentValid, actual: assessmentValid, required: true },
    { code: "COMMAND_SCORE", label: "Command readiness score", passed: assessmentValid && (evidence.commandAssessment?.commandScore ?? 0) >= 80, actual: evidence.commandAssessment?.commandScore ?? null, required: 80 },
  ];

  const blockers: string[] = [];
  if (evidence.recentCriticalEvents > 0) blockers.push("RECENT_CRITICAL_EVENT");
  if (evidence.openManualReviewPireps > 0) blockers.push("OPEN_MANUAL_REVIEW_PIREP");
  if (evidence.activePromotionRestrictions > 0) blockers.push("ACTIVE_PROMOTION_RESTRICTION");
  if (evidence.commandAssessment?.recommendation === "NOT_RECOMMENDED") blockers.push("COMMAND_NOT_RECOMMENDED");
  if (requirements.some((item) => !item.passed)) blockers.push("REQUIREMENTS_NOT_MET");

  const warnings: string[] = [];
  if (evidence.recentUnresolvedMajorEvents > 0) warnings.push("UNRESOLVED_MAJOR_EVENT");
  if (evidence.commandAssessment?.recommendation === "DEVELOPMENT_REQUIRED") warnings.push("COMMAND_DEVELOPMENT_REQUIRED");

  return {
    status: blockers.length ? "NOT_ELIGIBLE" : warnings.length ? "REVIEW_REQUIRED" : "ELIGIBLE",
    targetRank: "CPT",
    policyVersion: CAPTAIN_ELIGIBILITY_POLICY_VERSION,
    checkedAt,
    requirements,
    blockers: [...new Set(blockers)],
    warnings,
  };
}
