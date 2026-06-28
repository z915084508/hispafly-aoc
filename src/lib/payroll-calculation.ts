export const AIRCRAFT_HOURLY_RATES = {
  A320: 80,
  A321: 85,
  B772: 120,
  A359: 130,
  A388: 150,
} as const;

export type SupportedAircraft = keyof typeof AIRCRAFT_HOURLY_RATES;

export interface PayrollCalculationInput {
  aircraftType: SupportedAircraft;
  flightTimeMinutes: number;
  network: string;
  landingRate: number;
  score: number;
}

export interface PayrollCalculationResult {
  hourlyRate: number;
  basePay: number;
  networkBonus: number;
  landingBonus: number;
  scoreBonus: number;
  totalBonus: number;
  landingPenalty: number;
  scorePenalty: number;
  totalPenalty: number;
  finalAmount: number;
}

const roundCredits = (value: number) => Math.round(value * 100) / 100;

export function calculatePayroll(input: PayrollCalculationInput): PayrollCalculationResult {
  const hourlyRate = AIRCRAFT_HOURLY_RATES[input.aircraftType];
  if (!hourlyRate) throw new Error(`Unsupported aircraft type: ${input.aircraftType}`);
  if (input.flightTimeMinutes < 0) throw new Error("Flight time cannot be negative");

  const basePay = roundCredits((input.flightTimeMinutes / 60) * hourlyRate);
  const networkBonus = ["VATSIM", "IVAO"].includes(input.network.toUpperCase())
    ? roundCredits(basePay * 0.1)
    : 0;
  const landingBonus = input.landingRate <= -50 && input.landingRate >= -300 ? 100 : 0;
  const scoreBonus = input.score >= 95 ? 150 : 0;
  const landingPenalty = input.landingRate < -600 ? 200 : 0;
  const scorePenalty = input.score < 70 ? 150 : 0;
  const totalBonus = roundCredits(networkBonus + landingBonus + scoreBonus);
  const totalPenalty = roundCredits(landingPenalty + scorePenalty);
  const finalAmount = roundCredits(Math.max(0, basePay + totalBonus - totalPenalty));

  return { hourlyRate, basePay, networkBonus, landingBonus, scoreBonus, totalBonus, landingPenalty, scorePenalty, totalPenalty, finalAmount };
}

export const creditsToCents = (credits: number) => Math.round(credits * 100);
export const centsToCredits = (cents: number) => cents / 100;