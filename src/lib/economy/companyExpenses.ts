import { CompanyExpenseType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type ExpenseInput = {
  pirepId: string;
  type: CompanyExpenseType;
  amountCents: number;
  calculationDetails: Prisma.InputJsonValue;
};

const DEFAULT_AIRCRAFT_MTOW_KG = 70_000;
const DEFAULT_HANDLING_CENTS = 0;
const DEFAULT_CARGO_HANDLING_PER_TONNE_CENTS = 0;

function icao(value: string | null | undefined) {
  const code = value?.trim().toUpperCase();
  return code && /^[A-Z0-9]{4}$/.test(code) ? code : null;
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

async function aircraftEconomics(aircraftType: string | null) {
  if (!aircraftType) return { mtowKg: DEFAULT_AIRCRAFT_MTOW_KG, seatCapacity: null as number | null, cargoCapacityKg: null as number | null, source: "default" };
  const [aircraft, profile] = await Promise.all([
    prisma.aircraft.findFirst({
      where: { aircraftType: { equals: aircraftType, mode: "insensitive" } },
      orderBy: { updatedAt: "desc" },
    }).catch(() => null),
    prisma.aircraftProfile.findUnique({ where: { aircraftType } }).catch(() => null),
  ]);
  return {
    mtowKg: aircraft?.mtowKg ?? profile?.mtowKg ?? DEFAULT_AIRCRAFT_MTOW_KG,
    seatCapacity: aircraft?.seatCapacity ?? profile?.seatCapacity ?? null,
    cargoCapacityKg: aircraft?.cargoCapacityKg ?? profile?.cargoCapacityKg ?? null,
    source: aircraft?.mtowKg ? "vamsys_aircraft" : profile?.mtowKg ? "aoc_aircraft_profile" : "default",
  };
}

async function airportProfile(airportIcao: string | null) {
  if (!airportIcao) return null;
  return prisma.airportChargeProfile.findUnique({ where: { airportIcao } }).catch(() => null);
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

  const aircraft = await aircraftEconomics(pirep.aircraftType);
  const arrivalProfile = await airportProfile(arrival);
  const departureRegion = regionFromIcao(departure);
  const arrivalRegion = regionFromIcao(arrival);
  const enrouteProfile = await airspaceProfile(departureRegion);

  const passengers = pirep.passengers ?? 0;
  const cargoKg = pirep.cargoKg ?? 0;
  const distanceNm = pirep.flightDistanceNm ?? 0;
  const flightMinutes = pirep.flightTimeMinutes ?? 0;
  const blockMinutes = pirep.blockTimeMinutes ?? flightMinutes;
  const parkingHours = Math.max(0, (blockMinutes - flightMinutes) / 60);
  const mtowTonnes = Math.max(1, aircraft.mtowKg / 1000);
  const sqrtWeightFactor = Math.sqrt(mtowTonnes / 50);

  const landingRate = arrivalProfile?.landingRatePerTonneCents ?? 0;
  const passengerFee = arrivalProfile?.passengerFeeCents ?? 0;
  const serviceFee = arrivalProfile?.passengerServiceFeeCents ?? 0;
  const parkingRate = arrivalProfile?.parkingRatePerHourCents ?? 0;
  const terminalRate = arrivalProfile?.terminalAtcUnitRateCents ?? 0;
  const enrouteRate = enrouteProfile?.unitRateCents ?? 0;

  const expenses: ExpenseInput[] = [
    expense({
      pirepId,
      type: "airport_landing",
      amountCents: Math.round(mtowTonnes * landingRate),
      calculationDetails: { airportIcao: arrival, mtowKg: aircraft.mtowKg, mtowTonnes, landingRatePerTonneCents: landingRate, aircraftSource: aircraft.source },
    }),
    expense({
      pirepId,
      type: "airport_passenger",
      amountCents: Math.round(passengers * passengerFee),
      calculationDetails: { airportIcao: arrival, passengers, passengerFeeCents: passengerFee },
    }),
    expense({
      pirepId,
      type: "airport_service",
      amountCents: Math.round(passengers * serviceFee),
      calculationDetails: { airportIcao: arrival, passengers, passengerServiceFeeCents: serviceFee },
    }),
    expense({
      pirepId,
      type: "airport_parking",
      amountCents: Math.round(parkingHours * parkingRate),
      calculationDetails: { airportIcao: arrival, blockTimeMinutes: blockMinutes, flightTimeMinutes: flightMinutes, parkingHours, parkingRatePerHourCents: parkingRate },
    }),
    expense({
      pirepId,
      type: "handling",
      amountCents: DEFAULT_HANDLING_CENTS,
      calculationDetails: { airportIcao: arrival, rule: "default_handling", configured: false, amountCents: DEFAULT_HANDLING_CENTS },
    }),
    expense({
      pirepId,
      type: "cargo_handling",
      amountCents: Math.round((cargoKg / 1000) * DEFAULT_CARGO_HANDLING_PER_TONNE_CENTS),
      calculationDetails: { airportIcao: arrival, cargoKg, cargoTonnes: cargoKg / 1000, ratePerTonneCents: DEFAULT_CARGO_HANDLING_PER_TONNE_CENTS, configured: false },
    }),
    expense({
      pirepId,
      type: "atc_enroute",
      amountCents: Math.round((distanceNm / 100) * enrouteRate * sqrtWeightFactor),
      calculationDetails: { region: departureRegion, distanceNm, unitRateCents: enrouteRate, mtowKg: aircraft.mtowKg, sqrtWeightFactor, source: enrouteProfile ? "airspace_profile" : "missing_profile" },
    }),
    expense({
      pirepId,
      type: "atc_terminal",
      amountCents: Math.round(terminalRate * sqrtWeightFactor),
      calculationDetails: { airportIcao: arrival, region: arrivalRegion, terminalAtcUnitRateCents: terminalRate, mtowKg: aircraft.mtowKg, sqrtWeightFactor, source: arrivalProfile ? "airport_charge_profile" : "missing_profile" },
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
