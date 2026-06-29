export type AircraftType = "A320" | "A321" | "B772" | "A359" | "A388";

export interface PayrollPirepInput {
  aircraftType: string;
  flightTimeMinutes: number;
  network: string;
  landingRate: number;
  score: number;
  status?: string;
}

export interface PayrollRules {
  aircraftHourlyRates: Record<AircraftType, number>;
  onlineNetworks: readonly string[];
  networkBonusPercent: number;
  landingBonusMinimum: number;
  landingBonusMaximum: number;
  landingBonusCredits: number;
  scoreBonusMinimum: number;
  scoreBonusCredits: number;
  hardLandingThreshold: number;
  hardLandingPenaltyCredits: number;
  lowScoreThreshold: number;
  lowScorePenaltyCredits: number;
}

export interface PayrollCalculationResult {
  hourlyRate: number;
  basePay: number;
  aircraftBonus: number;
  networkBonus: number;
  landingBonus: number;
  scoreBonus: number;
  totalBonus: number;
  landingPenalty: number;
  scorePenalty: number;
  penalties: number;
  totalPenalty: number;
  finalAmount: number;
  explanation: string[];
}
