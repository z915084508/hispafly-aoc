import { CompanyExpenseType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { regionFromIcao } from "@/lib/economy/fuel";

type ExpenseInput = {
  type: CompanyExpenseType;
  amountCents: number;
  calculationDetails: Prisma.InputJsonValue;
};

const DEFAULT_AIRCRAFT_MTOW_KG = 70_000;
const LANDING_RATE_PER_TONNE_CENTS = 650;
const PASSENGER_FEE_CENTS = 850;
const PASSENGER_SERVICE_FEE_CENTS = 450;
const PARKING_RATE_PER_HOUR_CENTS = 1800;
const TERMINAL_ATC_UNIT_RATE_CENTS = 650;
const ATC_ENROUTE_UNIT_RATE_CENTS = 6800;
const HANDLING_CENTS = 0;
const CARGO_HANDLING_PER_TONNE_CENTS = 0;

const icao = (value: string | null | undefined) => {
  const code = value?.trim().toUpperCase();
  return code && /^[A-Z0-9]{4}$/.test(code) ? code : null;
};

async function ensureAirport(code: string | null, source = "pirep") {
  const airportIcao = icao(code);
  if (!airportIcao) return null;
  return prisma.airport.upsert({
    where: { icao: airportIcao },
    update: {},
    create: { icao: airportIcao, region: regionFromIcao(airportIcao), source },
  }).catch(() => null);
}

export async function generateCompanyExpensesForPirep(pirepId: string) {
  const pirep = await prisma.pirep.findUnique({ where: { id: pirepId } });
  if (!pirep || pirep.status !== "accepted") return { generated: 0, totalCents: 0 };

  const departure = icao(pirep.departure);
  const arrival = icao(pirep.arrival);
  await Promise.all([ensureAirport(departure), ensureAirport(arrival)]);

  const passengers = pirep.passengers ?? 0;
  const cargoKg = pirep.cargoKg ?? 0;
  const distanceNm = pirep.flightDistanceNm ?? 0;
  const distanceKm = distanceNm * 1.852;
  const flightMinutes = pirep.flightTimeMinutes ?? 0;
  const blockMinutes = pirep.blockTimeMinutes ?? flightMinutes;
  const parkingHours = Math.max(0, (blockMinutes - flightMinutes) / 60);
  const mtowKg = DEFAULT_AIRCRAFT_MTOW_KG;
  const mtowTonnes = Math.max(1, mtowKg / 1000);
  const sqrtWeightFactor = Math.sqrt(mtowTonnes / 50);
  const common = { departure, arrival, aircraftType: pirep.aircraftType, ruleSource: "aoc_default_pipeline" };

  const expenses: ExpenseInput[] = [
    {
      type: "airport_landing",
      amountCents: Math.round(mtowTonnes * LANDING_RATE_PER_TONNE_CENTS),
      calculationDetails: { ...common, mtowKg, mtowTonnes, landingRatePerTonneCents: LANDING_RATE_PER_TONNE_CENTS },
    },
    {
      type: "airport_passenger",
      amountCents: Math.round(passengers * PASSENGER_FEE_CENTS),
      calculationDetails: { ...common, passengers, passengerFeeCents: PASSENGER_FEE_CENTS },
    },
    {
      type: "airport_service",
      amountCents: Math.round(passengers * PASSENGER_SERVICE_FEE_CENTS),
      calculationDetails: { ...common, passengers, passengerServiceFeeCents: PASSENGER_SERVICE_FEE_CENTS },
    },
    {
      type: "airport_parking",
      amountCents: Math.round(parkingHours * PARKING_RATE_PER_HOUR_CENTS),
      calculationDetails: { ...common, blockMinutes, flightMinutes, parkingHours, parkingRatePerHourCents: PARKING_RATE_PER_HOUR_CENTS },
    },
    {
      type: "handling",
      amountCents: HANDLING_CENTS,
      calculationDetails: { ...common, amountCents: HANDLING_CENTS },
    },
    {
      type: "cargo_handling",
      amountCents: Math.round((cargoKg / 1000) * CARGO_HANDLING_PER_TONNE_CENTS),
      calculationDetails: { ...common, cargoKg, cargoTonnes: cargoKg / 1000, ratePerTonneCents: CARGO_HANDLING_PER_TONNE_CENTS },
    },
    {
      type: "atc_enroute",
      amountCents: Math.round((distanceKm / 100) * ATC_ENROUTE_UNIT_RATE_CENTS * sqrtWeightFactor),
      calculationDetails: { ...common, region: regionFromIcao(departure), distanceNm, distanceKm, unitRateCents: ATC_ENROUTE_UNIT_RATE_CENTS, mtowKg, sqrtWeightFactor },
    },
    {
      type: "atc_terminal",
      amountCents: Math.round(TERMINAL_ATC_UNIT_RATE_CENTS * sqrtWeightFactor),
      calculationDetails: { ...common, region: regionFromIcao(arrival), terminalAtcUnitRateCents: TERMINAL_ATC_UNIT_RATE_CENTS, mtowKg, sqrtWeightFactor },
    },
  ];

  for (const item of expenses) {
    await prisma.companyExpense.upsert({
      where: { pirepId_type: { pirepId, type: item.type } },
      update: { amountCents: item.amountCents, calculationDetails: item.calculationDetails },
      create: { pirepId, type: item.type, amountCents: item.amountCents, calculationDetails: item.calculationDetails },
    });
  }

  return { generated: expenses.length, totalCents: expenses.reduce((sum, item) => sum + item.amountCents, 0) };
}
