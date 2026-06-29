export interface PassengerRevenueResult {
  passengers: number;
  distanceNm: number;
  baseFareCredits: number;
  distanceFactor: number;
  revenueCredits: number;
  revenueCents: number;
}

export const PASSENGER_BASE_FARE_CREDITS = 80;

export function getDistanceFactor(distanceNm: number): number {
  if (!Number.isFinite(distanceNm) || distanceNm < 0) throw new Error("Distance must be a non-negative number.");
  if (distanceNm <= 300) return 0.75;
  if (distanceNm <= 800) return 1;
  if (distanceNm <= 1500) return 1.3;
  if (distanceNm <= 3000) return 1.8;
  if (distanceNm <= 5000) return 2.4;
  return 3;
}

export function calculatePassengerRevenue(passengers: number, distanceNm: number): PassengerRevenueResult {
  if (!Number.isInteger(passengers) || passengers < 0) throw new Error("Passengers must be a non-negative integer.");
  const distanceFactor = getDistanceFactor(distanceNm);
  const revenueCredits = Math.round(passengers * PASSENGER_BASE_FARE_CREDITS * distanceFactor * 100) / 100;
  return { passengers, distanceNm, baseFareCredits: PASSENGER_BASE_FARE_CREDITS, distanceFactor, revenueCredits, revenueCents: Math.round(revenueCredits * 100) };
}
