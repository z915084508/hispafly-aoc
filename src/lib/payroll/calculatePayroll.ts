import { DEFAULT_PAYROLL_RULES } from "./rules.ts";
import type { AircraftType, PayrollCalculationResult, PayrollPirepInput, PayrollRules } from "./types.ts";

const roundCredits = (value: number) => Math.round(value * 100) / 100;
const formatCredits = (value: number) => new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(value);
const formatHours = (minutes: number) => new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(minutes / 60);

export function isPayrollEligible(pirep: Pick<PayrollPirepInput, "status">): boolean {
  return pirep.status?.toLowerCase() === "accepted";
}

export function calculatePayroll(
  input: PayrollPirepInput,
  rules: PayrollRules = DEFAULT_PAYROLL_RULES,
): PayrollCalculationResult {
  if (!Number.isFinite(input.flightTimeMinutes) || input.flightTimeMinutes < 0) {
    throw new Error("Flight time must be a non-negative number.");
  }
  if (!Number.isFinite(input.landingRate) || !Number.isFinite(input.score)) {
    throw new Error("Landing rate and score must be valid numbers.");
  }

  const aircraftType = input.aircraftType.toUpperCase() as AircraftType;
  const hourlyRate = rules.aircraftHourlyRates[aircraftType];
  if (hourlyRate === undefined) throw new Error(`Unsupported aircraft type: ${input.aircraftType}`);

  const basePay = roundCredits((input.flightTimeMinutes / 60) * hourlyRate);
  const aircraftBonus = 0;
  const network = input.network.toUpperCase();
  const networkBonus = rules.onlineNetworks.includes(network)
    ? roundCredits(basePay * (rules.networkBonusPercent / 100))
    : 0;
  const landingBonus = input.landingRate >= rules.landingBonusMinimum && input.landingRate <= rules.landingBonusMaximum
    ? rules.landingBonusCredits
    : 0;
  const scoreBonus = input.score >= rules.scoreBonusMinimum ? rules.scoreBonusCredits : 0;
  const landingPenalty = input.landingRate < rules.hardLandingThreshold ? rules.hardLandingPenaltyCredits : 0;
  const scorePenalty = input.score < rules.lowScoreThreshold ? rules.lowScorePenaltyCredits : 0;
  const totalBonus = roundCredits(aircraftBonus + networkBonus + landingBonus + scoreBonus);
  const penalties = roundCredits(landingPenalty + scorePenalty);
  const finalAmount = roundCredits(Math.max(0, basePay + totalBonus - penalties));

  const explanation = [
    `Pago base: ${formatHours(input.flightTimeMinutes)} h × tarifa ${aircraftType} ${formatCredits(hourlyRate)} = ${formatCredits(basePay)} créditos`,
  ];
  if (aircraftBonus) explanation.push(`Bonificación de aeronave: +${formatCredits(aircraftBonus)} créditos`);
  if (networkBonus) explanation.push(`Bonificación de red: ${network} +${rules.networkBonusPercent}% = ${formatCredits(networkBonus)} créditos`);
  if (landingBonus) explanation.push(`Bonificación de aterrizaje: ${input.landingRate} fpm = +${formatCredits(landingBonus)} créditos`);
  if (scoreBonus) explanation.push(`Bonificación de puntuación: ${input.score} = +${formatCredits(scoreBonus)} créditos`);
  if (landingPenalty) explanation.push(`Penalización de aterrizaje: ${input.landingRate} fpm = -${formatCredits(landingPenalty)} créditos`);
  if (scorePenalty) explanation.push(`Penalización de puntuación: ${input.score} = -${formatCredits(scorePenalty)} créditos`);
  explanation.push(`Importe final: ${formatCredits(finalAmount)} créditos`);

  return {
    hourlyRate,
    basePay,
    aircraftBonus,
    networkBonus,
    landingBonus,
    scoreBonus,
    totalBonus,
    landingPenalty,
    scorePenalty,
    penalties,
    totalPenalty: penalties,
    finalAmount,
    explanation,
  };
}

export const creditsToCents = (credits: number) => Math.round(credits * 100);
export const centsToCredits = (cents: number) => cents / 100;
