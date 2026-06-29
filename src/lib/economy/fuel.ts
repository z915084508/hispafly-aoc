import { prisma } from "@/lib/prisma";

export const IATA_JET_FUEL_PRICE_SOURCE = "IATA Jet Fuel Price Monitor";
export const IATA_JET_FUEL_PRICE_URL = "https://www.iata.org/en/publications/economics/fuel-monitor/";

export const FUEL_REGIONS = ["GLOBAL", "EUROPE", "NORTH_AMERICA", "ASIA", "MIDDLE_EAST"] as const;
export type FuelRegion = (typeof FUEL_REGIONS)[number];

export interface FuelCostSnapshot {
  fuelCostCents: number | null;
  fuelPricePerKgCents: number | null;
  fuelPriceRegion: string | null;
  fuelPriceSource: string | null;
}

export function regionFromIcao(icao: string | null | undefined): FuelRegion {
  const code = icao?.trim().toUpperCase();
  if (!code) return "GLOBAL";
  if (/^(E|L|U)/.test(code)) return "EUROPE";
  if (/^(K|C|P)/.test(code)) return "NORTH_AMERICA";
  if (/^O/.test(code)) return "MIDDLE_EAST";
  if (/^(R|V|W|Y|Z)/.test(code)) return "ASIA";
  return "GLOBAL";
}

export async function latestFuelPrice(region: FuelRegion, at = new Date()) {
  const regional = await prisma.fuelPrice.findFirst({
    where: { region, effectiveFrom: { lte: at } },
    orderBy: { effectiveFrom: "desc" },
  });
  if (regional) return regional;
  return prisma.fuelPrice.findFirst({
    where: { region: "GLOBAL", effectiveFrom: { lte: at } },
    orderBy: { effectiveFrom: "desc" },
  });
}

export async function calculateFuelCostSnapshot(input: {
  departure: string | null | undefined;
  fuelUsedKg: number | null | undefined;
  at?: Date | null;
}): Promise<FuelCostSnapshot> {
  const fuelUsedKg = input.fuelUsedKg ?? null;
  if (fuelUsedKg === null || fuelUsedKg <= 0) {
    return { fuelCostCents: null, fuelPricePerKgCents: null, fuelPriceRegion: null, fuelPriceSource: null };
  }

  const region = regionFromIcao(input.departure);
  const price = await latestFuelPrice(region, input.at ?? new Date());
  if (!price) {
    return { fuelCostCents: null, fuelPricePerKgCents: null, fuelPriceRegion: region, fuelPriceSource: IATA_JET_FUEL_PRICE_SOURCE };
  }

  return {
    fuelCostCents: Math.round(fuelUsedKg * price.pricePerKgCents),
    fuelPricePerKgCents: price.pricePerKgCents,
    fuelPriceRegion: price.region,
    fuelPriceSource: price.source,
  };
}
