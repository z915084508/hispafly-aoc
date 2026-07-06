export interface TankeringCalculationInput {
  departurePricePerKgCents: number;
  arrivalPricePerKgCents: number;
  fuelCapacityMarginKg: number;
  takeoffWeightMarginKg: number;
  landingWeightMarginKg: number;
  maximumRecommendationKg?: number;
}

export function calculateTankeringRecommendation(input: TankeringCalculationInput) {
  const difference = input.arrivalPricePerKgCents - input.departurePricePerKgCents;
  if (difference <= 0) return null;
  const available = Math.min(input.maximumRecommendationKg ?? 1000, input.fuelCapacityMarginKg, input.takeoffWeightMarginKg, input.landingWeightMarginKg);
  const recommendedKg = Math.floor(Math.max(0, available) / 100) * 100;
  if (recommendedKg < 100) return null;
  return { recommendedKg, estimatedSavingCents: Math.round(recommendedKg * difference), priceDifferencePerKgCents: difference };
}

