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
  const aircraftTypeValue = input.aircraftType;
  const flightTimeMinutes = input.flightTimeMinutes;
  const networkValue = input.network;
  const landingRate = input.landingRate;
  const score = input.score;

  const missingFields: string[] = [];
  if (!aircraftTypeValue) missingFields.push("aircraftType");
  if (flightTimeMinutes === null) missingFields.push("flightTimeMinutes");
  if (!networkValue) missingFields.push("network");
  if (landingRate === null) missingFields.push("landingRate");
  if (score === null) missingFields.push("score");

  if (!aircraftTypeValue || flightTimeMinutes === null || !networkValue || landingRate === null || score === null) {
    throw new Error(`PIREP is missing required payroll fields: ${missingFields.join(", ")}.`);
  }

  if (!Number.isFinite(flightTimeMinutes) || flightTimeMinutes < 0) {
    throw new Error("Flight time must be a non-negative number.");
  }
  if (!Number.isFinite(landingRate) || !Number.isFinite(score)) {
    throw new Error("Landing rate and score must be valid numbers.");
  }

  const aircraftType = aircraftTypeValue.toUpperCase() as AircraftType;
  const hourlyRate = rules.aircraftHourlyRates[aircraftType];
  if (hourlyRate === undefined) throw new Error(`Unsupported aircraft type: ${aircraftTypeValue}`);

  const basePay = roundCredits((flightTimeMinutes / 60) * hourlyRate);
  const aircraftBonus = 0;
  const network = networkValue.toUpperCase();
  const networkBonus = rules.onlineNetworks.includes(network)
    ? roundCredits(basePay * (rules.networkBonusPercent / 100))
    : 0;
  const landingBonus = landingRate >= rules.landingBonusMinimum && landingRate <= rules.landingBonusMaximum
    ? rules.landingBonusCredits
    : 0;
  const scoreBonus = score >= rules.scoreBonusMinimum ? rules.scoreBonusCredits : 0;
  const landingPenalty = landingRate < rules.hardLandingThreshold ? rules.hardLandingPenaltyCredits : 0;
  const scorePenalty = score < rules.lowScoreThreshold ? rules.lowScorePenaltyCredits : 0;
  const totalBonus = roundCredits(aircraftBonus + networkBonus + landingBonus + scoreBonus);
  const penalties = roundCredits(landingPenalty + scorePenalty);
  const finalAmount = roundCredits(Math.max(0, basePay + totalBonus - penalties));

  const explanation = [
    `Pago base: ${formatHours(flightTimeMinutes)} h x tarifa ${aircraftType} ${formatCredits(hourlyRate)} = ${formatCredits(basePay)} creditos`,
  ];
  if (aircraftBonus) explanation.push(`Bonificacion de aeronave: +${formatCredits(aircraftBonus)} creditos`);
  if (networkBonus) explanation.push(`Bonificacion de red: ${network} +${rules.networkBonusPercent}% = ${formatCredits(networkBonus)} creditos`);
  if (landingBonus) explanation.push(`Bonificacion de aterrizaje: ${landingRate} fpm = +${formatCredits(landingBonus)} creditos`);
  if (scoreBonus) explanation.push(`Bonificacion de puntuacion: ${score} = +${formatCredits(scoreBonus)} creditos`);
  if (landingPenalty) explanation.push(`Penalizacion de aterrizaje: ${landingRate} fpm = -${formatCredits(landingPenalty)} creditos`);
  if (scorePenalty) explanation.push(`Penalizacion de puntuacion: ${score} = -${formatCredits(scorePenalty)} creditos`);
  explanation.push(`Importe final: ${formatCredits(finalAmount)} creditos`);

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
