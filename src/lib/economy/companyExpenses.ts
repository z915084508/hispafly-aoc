import { CompanyExpenseType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { handlingFeeForAircraft } from "./handling";

type AirportCategory = "mega_hub" | "major" | "medium" | "small" | "regional" | "standard";

type ExpenseInput = {
  pirepId: string;
  type: CompanyExpenseType;
  amountCents: number;
  calculationDetails: Prisma.InputJsonValue;
};

type AircraftEconomics = {
  mtowKg: number | null;
  seatCapacity: number | null;
  cargoCapacityKg: number | null;
  aircraftType: string | null;
  source: string;
};

const DEFAULT_AIRCRAFT_MTOW_KG = 70_000;
const DEFAULT_CARGO_HANDLING_PER_TONNE_CENTS = 12_000;


const AIRCRAFT_ALIASES: Record<string, string> = {
  B77W: "B772",
  B38M: "B738",
  A20N: "A320",
  A21N: "A321",
  A35K: "A359",
};

const KNOWN_AIRPORT_CATEGORIES: Record<string, AirportCategory> = {
  LEMD: "mega_hub",
  LEBL: "mega_hub",
  EGLL: "mega_hub",
  LFPG: "mega_hub",
  EHAM: "mega_hub",
  EDDF: "mega_hub",
  LEPA: "major",
  GCTS: "major",
  GCLP: "major",
  LPPT: "major",
  LIRF: "major",
  LIMC: "major",
  LEVC: "medium",
  LEMG: "medium",
  LEBB: "medium",
  LERS: "medium",
  LEGR: "medium",
  LEAS: "small",
  LEXJ: "small",
  LELC: "small",
  LEAL: "small",
  LEGE: "small",
};

function icao(value: string | null | undefined) {
  const code = value?.trim().toUpperCase();
  return code && /^[A-Z0-9]{4}$/.test(code) ? code : null;
}

function normalizeAircraftType(value: string | null | undefined) {
  const code = value?.trim().toUpperCase() ?? null;
  return code ? AIRCRAFT_ALIASES[code] ?? code : null;
}

export function classifyAirportSize(airportIcao: string | null | undefined, usageCount = 0): AirportCategory {
  const code = icao(airportIcao);
  if (!code) return "standard";
  const known = KNOWN_AIRPORT_CATEGORIES[code];
  if (known) return known;
  if (usageCount >= 250) return "mega_hub";
  if (usageCount >= 100) return "major";
  if (usageCount >= 25) return "medium";
  if (usageCount >= 5) return "small";
  return "standard";
}

function regionFromIcao(value: string | null | undefined) {
  const code = icao(value);
  if (!code) return "GLOBAL";
  if (/^(E|L|U)/.test(code)) return "EUROPE";
  if (/^(K|C|P)/.test(code)) return "NORTH_AMERICA";
  if (/^O/.test(code)) return "MIDDLE_EAST";
  if (/^(R|V|W|Y|Z)/.test(code)) return "ASIA";
  return "GLOBAL";
}

async function ensureAirport(code: string | null, source = "pirep") {
  const airportIcao = icao(code);
  if (!airportIcao) return null;
  return prisma.airport.upsert({
    where: { icao: airportIcao },
    update: {},
    create: { icao: airportIcao, region: regionFromIcao(airportIcao), source },
  });
}

async function airportUsageCount(airportIcao: string | null) {
  if (!airportIcao) return 0;
  return prisma.pirep.count({
    where: {
      status: "accepted",
      OR: [{ departure: airportIcao }, { arrival: airportIcao }],
    },
  }).catch(() => 0);
}

export async function resolveAircraftProfile(aircraftType: string | null): Promise<AircraftEconomics> {
  const normalized = normalizeAircraftType(aircraftType);
  if (!normalized) return { mtowKg: null, seatCapacity: null, cargoCapacityKg: null, aircraftType: null, source: "missing_aircraft_type" };
  const [aircraft, profile] = await Promise.all([
    prisma.aircraft.findFirst({
      where: { aircraftType: { equals: normalized, mode: "insensitive" } },
      orderBy: { updatedAt: "desc" },
    }).catch(() => null),
    prisma.aircraftProfile.findUnique({ where: { aircraftType: normalized } }).catch(() => null),
  ]);
  return {
    mtowKg: aircraft?.mtowKg ?? profile?.mtowKg ?? DEFAULT_AIRCRAFT_MTOW_KG,
    seatCapacity: aircraft?.seatCapacity ?? profile?.seatCapacity ?? null,
    cargoCapacityKg: aircraft?.cargoCapacityKg ?? profile?.cargoCapacityKg ?? null,
    aircraftType: normalized,
    source: aircraft?.mtowKg ? "vamsys_aircraft" : profile?.mtowKg ? "aoc_aircraft_profile" : "default_mtow_warning",
  };
}

export async function resolveAirportChargeProfile(airportIcao: string | null) {
  if (!airportIcao) return { profile: null, airportCategory: "standard" as AirportCategory, source: "missing_airport" };
  const override = await prisma.airportChargeProfile.findUnique({ where: { airportIcao } }).catch(() => null);
  if (override) return { profile: override, airportCategory: override.airportCategory as AirportCategory, source: "airport_override" };

  const usageCount = await airportUsageCount(airportIcao);
  const airportCategory = classifyAirportSize(airportIcao, usageCount);
  const categoryProfile = await prisma.airportCategoryChargeProfile.findUnique({ where: { airportCategory } }).catch(() => null);
  if (categoryProfile) return { profile: categoryProfile, airportCategory, source: "airport_category_profile", usageCount };

  const standard = await prisma.airportCategoryChargeProfile.findUnique({ where: { airportCategory: "standard" } }).catch(() => null);
  return { profile: standard, airportCategory: "standard" as AirportCategory, source: standard ? "airport_category_fallback" : "missing_airport_rule", usageCount };
}

async function airspaceProfile(region: string) {
  const regional = await prisma.airspaceChargeProfile.findUnique({ where: { region } }).catch(() => null);
  if (regional) return regional;
  return prisma.airspaceChargeProfile.findUnique({ where: { region: "GLOBAL" } }).catch(() => null);
}

function expense(input: ExpenseInput): ExpenseInput {
  return input;
}

export async function generateCompanyExpensesForPirep(pirepId: string) {
  const pirep = await prisma.pirep.findUnique({ where: { id: pirepId } });
  if (!pirep || pirep.status !== "accepted") return { generated: 0, totalCents: 0 };

  const departure = icao(pirep.departure);
  const arrival = icao(pirep.arrival);
  await Promise.all([ensureAirport(departure), ensureAirport(arrival)]);

  const aircraft = await resolveAircraftProfile(pirep.aircraftType);
  const arrivalRule = await resolveAirportChargeProfile(arrival);
  const arrivalProfile = arrivalRule.profile;
  const departureRegion = regionFromIcao(departure);
  const arrivalRegion = regionFromIcao(arrival);
  const enrouteProfile = await airspaceProfile(departureRegion);

  const passengers = pirep.passengers ?? 0;
  const cargoKg = pirep.cargoKg ?? 0;
  const distanceNm = pirep.flightDistanceNm ?? 0;
  const distanceKm = distanceNm * 1.852;
  const flightMinutes = pirep.flightTimeMinutes ?? 0;
  const blockMinutes = pirep.blockTimeMinutes ?? flightMinutes;
  const parkingHours = Math.max(0, (blockMinutes - flightMinutes) / 60);
  const mtowKg = aircraft.mtowKg ?? DEFAULT_AIRCRAFT_MTOW_KG;
  const mtowTonnes = Math.max(1, mtowKg / 1000);
  const sqrtWeightFactor = Math.sqrt(mtowTonnes / 50);

  const landingRate = arrivalProfile?.landingRatePerTonneCents ?? 0;
  const passengerFee = arrivalProfile?.passengerFeeCents ?? 0;
  const serviceFee = arrivalProfile?.passengerServiceFeeCents ?? 0;
  const parkingRate = arrivalProfile?.parkingRatePerHourCents ?? 0;
  const terminalRate = arrivalProfile?.terminalAtcUnitRateCents ?? 0;
  const handlingFee = handlingFeeForAircraft(pirep.aircraftType);
  const enrouteRate = enrouteProfile?.unitRateCents ?? 0;
  const commonAirportDetails = { airportIcao: arrival, airportCategory: arrivalRule.airportCategory, ruleSource: arrivalRule.source };

  const expenses: ExpenseInput[] = [
    expense({
      pirepId,
      type: "airport_landing",
      amountCents: Math.round(mtowTonnes * landingRate),
      calculationDetails: { ...commonAirportDetails, mtowKg, mtowTonnes, landingRatePerTonneCents: landingRate, aircraftSource: aircraft.source, aircraftType: aircraft.aircraftType },
    }),
    expense({
      pirepId,
      type: "airport_passenger",
      amountCents: Math.round(passengers * passengerFee),
      calculationDetails: { ...commonAirportDetails, passengers, passengerFeeCents: passengerFee },
    }),
    expense({
      pirepId,
      type: "airport_service",
      amountCents: Math.round(passengers * serviceFee),
      calculationDetails: { ...commonAirportDetails, passengers, passengerServiceFeeCents: serviceFee },
    }),
    expense({
      pirepId,
      type: "airport_parking",
      amountCents: Math.round(parkingHours * parkingRate),
      calculationDetails: { ...commonAirportDetails, blockTimeMinutes: blockMinutes, flightTimeMinutes: flightMinutes, parkingHours, parkingRatePerHourCents: parkingRate },
    }),
    expense({
      pirepId,
      type: "handling",
      amountCents: handlingFee.amountCents,
      calculationDetails: { ...commonAirportDetails, rule: "full_service_regular", source: "ground_handling_fees_2022", aircraftType: handlingFee.normalizedAircraftType, handlingClass: handlingFee.handlingClass, class6Fallback: handlingFee.class6Fallback, amountCents: handlingFee.amountCents },
    }),
    expense({
      pirepId,
      type: "cargo_handling",
      amountCents: Math.round((cargoKg / 1000) * DEFAULT_CARGO_HANDLING_PER_TONNE_CENTS),
      calculationDetails: { ...commonAirportDetails, cargoKg, cargoTonnes: cargoKg / 1000, ratePerTonneCents: DEFAULT_CARGO_HANDLING_PER_TONNE_CENTS, configured: false },
    }),
    expense({
      pirepId,
      type: "atc_enroute",
      amountCents: Math.round((distanceKm / 100) * enrouteRate * sqrtWeightFactor),
      calculationDetails: { region: departureRegion, distanceNm, distanceKm, unitRateCents: enrouteRate, mtowKg, sqrtWeightFactor, source: enrouteProfile ? "airspace_profile" : "missing_profile" },
    }),
    expense({
      pirepId,
      type: "atc_terminal",
      amountCents: Math.round(terminalRate * sqrtWeightFactor),
      calculationDetails: { ...commonAirportDetails, region: arrivalRegion, terminalAtcUnitRateCents: terminalRate, mtowKg, sqrtWeightFactor },
    }),
  ];

  for (const item of expenses) {
    await prisma.companyExpense.upsert({
      where: { pirepId_type: { pirepId: item.pirepId, type: item.type } },
      update: { amountCents: item.amountCents, calculationDetails: item.calculationDetails },
      create: { pirepId: item.pirepId, type: item.type, amountCents: item.amountCents, calculationDetails: item.calculationDetails },
    });
  }

  return { generated: expenses.length, totalCents: expenses.reduce((sum, item) => sum + item.amountCents, 0) };
}
