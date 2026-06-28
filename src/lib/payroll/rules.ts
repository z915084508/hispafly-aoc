import type { PayrollRules } from "./types.ts";

export const DEFAULT_PAYROLL_RULES: PayrollRules = {
  aircraftHourlyRates: { A320: 80, A321: 85, B772: 120, A359: 130, A388: 150 },
  onlineNetworks: ["VATSIM", "IVAO"],
  networkBonusPercent: 10,
  landingBonusMinimum: -300,
  landingBonusMaximum: -50,
  landingBonusCredits: 100,
  scoreBonusMinimum: 95,
  scoreBonusCredits: 150,
  hardLandingThreshold: -600,
  hardLandingPenaltyCredits: 200,
  lowScoreThreshold: 70,
  lowScorePenaltyCredits: 150,
};

export const AIRCRAFT_HOURLY_RATES = DEFAULT_PAYROLL_RULES.aircraftHourlyRates;

export function payrollRulesFromStoredRule(stored: {
  aircraftRates: unknown;
  bonusRules: unknown;
  penaltyRules: unknown;
}): PayrollRules {
  const aircraftRates = stored.aircraftRates as Partial<PayrollRules["aircraftHourlyRates"]> | null;
  const bonuses = stored.bonusRules as Record<string, unknown> | null;
  const penalties = stored.penaltyRules as Record<string, unknown> | null;
  const numberOr = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
  const landingRange = Array.isArray(bonuses?.landingRange) ? bonuses.landingRange : [];

  return {
    ...DEFAULT_PAYROLL_RULES,
    aircraftHourlyRates: { ...DEFAULT_PAYROLL_RULES.aircraftHourlyRates, ...aircraftRates },
    networkBonusPercent: numberOr(bonuses?.onlineNetworkPercent, DEFAULT_PAYROLL_RULES.networkBonusPercent),
    landingBonusMinimum: numberOr(landingRange[0], DEFAULT_PAYROLL_RULES.landingBonusMinimum),
    landingBonusMaximum: numberOr(landingRange[1], DEFAULT_PAYROLL_RULES.landingBonusMaximum),
    landingBonusCredits: numberOr(bonuses?.landingBonus, DEFAULT_PAYROLL_RULES.landingBonusCredits),
    scoreBonusMinimum: numberOr(bonuses?.minimumScore, DEFAULT_PAYROLL_RULES.scoreBonusMinimum),
    scoreBonusCredits: numberOr(bonuses?.scoreBonus, DEFAULT_PAYROLL_RULES.scoreBonusCredits),
    hardLandingThreshold: numberOr(penalties?.landingRateBelow, DEFAULT_PAYROLL_RULES.hardLandingThreshold),
    hardLandingPenaltyCredits: numberOr(penalties?.landingPenalty, DEFAULT_PAYROLL_RULES.hardLandingPenaltyCredits),
    lowScoreThreshold: numberOr(penalties?.scoreBelow, DEFAULT_PAYROLL_RULES.lowScoreThreshold),
    lowScorePenaltyCredits: numberOr(penalties?.scorePenalty, DEFAULT_PAYROLL_RULES.lowScorePenaltyCredits),
  };
}
