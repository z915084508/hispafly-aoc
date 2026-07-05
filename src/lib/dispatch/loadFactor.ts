export const HISPAFLY_BASES = ["LEBL", "LEPA", "LEVC", "LEMD"] as const;
export const BASE_FUEL_DISCOUNT_PERCENT = 21;

export type RouteDemandClass = "BASE_TO_BASE" | "BASE_ROUTE" | "OTHER";

export function routeDemandClass(departure: string, arrival: string): RouteDemandClass {
  const fromBase = HISPAFLY_BASES.includes(departure.toUpperCase() as (typeof HISPAFLY_BASES)[number]);
  const toBase = HISPAFLY_BASES.includes(arrival.toUpperCase() as (typeof HISPAFLY_BASES)[number]);
  return fromBase && toBase ? "BASE_TO_BASE" : fromBase || toBase ? "BASE_ROUTE" : "OTHER";
}

export function suggestedLoadFactor(input: { departure: string; arrival: string; departureAt: Date }) {
  const routeClass = routeDemandClass(input.departure, input.arrival);
  let percent = routeClass === "BASE_TO_BASE" ? 84 : routeClass === "BASE_ROUTE" ? 76 : 64;
  const day = input.departureAt.getUTCDay();
  const hour = input.departureAt.getUTCHours();
  if (day === 5 || day === 0) percent += 6;
  if (day === 2 || day === 3) percent -= 4;
  if ((hour >= 7 && hour <= 10) || (hour >= 16 && hour <= 20)) percent += 4;
  if (hour < 6 || hour >= 22) percent -= 8;
  const month = input.departureAt.getUTCMonth() + 1;
  if ([6, 7, 8, 12].includes(month)) percent += 5;
  return Math.max(25, Math.min(98, percent));
}

export function calculateDispatchPayload(input: { seats: number; loadFactorPercent: number; baggageKgPerPassenger?: number }) {
  if (!Number.isFinite(input.seats) || input.seats <= 0) throw new Error("Aircraft seat capacity is required.");
  if (!Number.isFinite(input.loadFactorPercent) || input.loadFactorPercent < 0 || input.loadFactorPercent > 100) throw new Error("Load factor must be between 0 and 100.");
  const passengers = Math.min(input.seats, Math.max(0, Math.round(input.seats * input.loadFactorPercent / 100)));
  const baggageKgPerPassenger = input.baggageKgPerPassenger ?? 23;
  if (!Number.isFinite(baggageKgPerPassenger) || baggageKgPerPassenger < 0) throw new Error("Baggage per passenger must be zero or greater.");
  return { passengers, luggageKg: Math.round(passengers * baggageKgPerPassenger), baggageKgPerPassenger };
}

export function baseFuelDiscountPercent(departure: string | null | undefined) {
  return HISPAFLY_BASES.includes((departure ?? "").toUpperCase() as (typeof HISPAFLY_BASES)[number]) ? BASE_FUEL_DISCOUNT_PERCENT : 0;
}
