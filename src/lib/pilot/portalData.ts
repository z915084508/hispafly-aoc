import { prisma } from "@/lib/prisma";
import { careerProgress, earnedAwards, normalizePilotRank } from "@/lib/pilot/career";

type JsonRecord = Record<string, unknown>;

function monthRange(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end, settlementMonth: start.toISOString().slice(0, 7) };
}

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function numberFromPayload(value: unknown, keys: string[]): number {
  const row = record(value);
  if (!row) return 0;
  for (const key of keys) {
    const candidate = row[key];
    if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
    if (typeof candidate === "string") {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  const attributes = record(row.attributes);
  return attributes ? numberFromPayload(attributes, keys) : 0;
}

export async function getPilotDashboardData(pilotId: string) {
  const { start, end } = monthRange();
  const monthFilter = { gte: start, lt: end };
  const [pilotPireps, latestPireps, topRows] = await Promise.all([
    prisma.pirep.findMany({
      where: { pilotId, status: "accepted", flownAt: monthFilter },
      select: { passengers: true, cargoKg: true, rawData: true },
    }),
    prisma.pirep.findMany({
      where: { pilotId, status: "accepted" },
      select: {
        id: true,
        vamsysPirepId: true,
        flightNumber: true,
        departure: true,
        arrival: true,
        aircraftType: true,
        passengers: true,
        cargoKg: true,
        fuelUsed: true,
        passengerRevenueCents: true,
        fuelCostCents: true,
        flownAt: true,
        createdAt: true,
      },
      orderBy: [{ flownAt: "desc" }, { createdAt: "desc" }],
      take: 10,
    }),
    prisma.pirep.groupBy({
      by: ["pilotId"],
      where: { status: "accepted", flownAt: monthFilter },
      _count: { _all: true },
      orderBy: { _count: { pilotId: "desc" } },
      take: 5,
    }),
  ]);
  const pilots = await prisma.pilot.findMany({
    where: { id: { in: topRows.map((row) => row.pilotId) } },
    select: { id: true, displayName: true, callsign: true },
  });
  const pilotNames = new Map(pilots.map((pilot) => [pilot.id, pilot]));
  return {
    acceptedPireps: pilotPireps.length,
    totalPassengers: pilotPireps.reduce((sum, row) => sum + (row.passengers ?? 0), 0),
    totalCargo: pilotPireps.reduce((sum, row) => sum + (row.cargoKg ?? numberFromPayload(row.rawData, ["cargo", "cargo_weight", "cargoWeight", "freight", "freight_weight", "freightWeight", "load", "payload"])), 0),
    latestPireps,
    topPilots: topRows.map((row) => {
      const pilot = pilotNames.get(row.pilotId);
      return { pilotId: row.pilotId, name: pilot?.displayName ?? "Piloto", callsign: pilot?.callsign ?? null, count: row._count._all };
    }),
  };
}

export async function getPilotHubData(pilotId: string) {
  const [pilot, pireps, recentTransactions] = await Promise.all([
    prisma.pilot.findUniqueOrThrow({
      where: { id: pilotId },
      select: { id: true, displayName: true, callsign: true, email: true, base: true, hubId: true, status: true, rank: true, rankName: true, rankAbbreviation: true, appointment: true, walletBalanceCents: true, createdAt: true },
    }),
    prisma.pirep.findMany({
      where: { pilotId },
      select: { status: true, flightTimeMinutes: true, blockTimeMinutes: true, aircraftType: true, aircraftRegistration: true, landingRate: true, score: true, flownAt: true },
      orderBy: [{ flownAt: "desc" }, { createdAt: "desc" }],
    }),
    prisma.walletTransaction.findMany({ where: { pilotId }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);
  const accepted = pireps.filter((row) => row.status === "accepted");
  const acceptedMinutes = accepted.reduce((sum, row) => sum + (row.flightTimeMinutes ?? row.blockTimeMinutes ?? 0), 0);
  const stats = { acceptedSectors: accepted.length, acceptedMinutes, totalPireps: pireps.length };
  const fleetMap = new Map<string, { sectors: number; minutes: number }>();
  for (const row of accepted) {
    const fleet = row.aircraftType?.trim().toUpperCase() || "UNKNOWN";
    const current = fleetMap.get(fleet) ?? { sectors: 0, minutes: 0 };
    current.sectors += 1;
    current.minutes += row.flightTimeMinutes ?? row.blockTimeMinutes ?? 0;
    fleetMap.set(fleet, current);
  }
  const scores = accepted.flatMap((row) => row.score == null ? [] : [row.score]);
  const landings = accepted.flatMap((row) => row.landingRate == null ? [] : [row.landingRate]);
  const rank = normalizePilotRank(pilot.rankAbbreviation, pilot.rankName, pilot.rank);
  return {
    pilot,
    rank,
    stats: { ...stats, hispaflyHours: acceptedMinutes / 60, acceptanceRate: pireps.length ? accepted.length / pireps.length * 100 : 100 },
    career: careerProgress(rank, stats),
    fleetExperience: [...fleetMap.entries()].map(([fleet, value]) => ({ fleet, ...value, hours: value.minutes / 60 })).sort((a, b) => b.minutes - a.minutes),
    performance: {
      averageScore: scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null,
      averageLandingRate: landings.length ? landings.reduce((sum, value) => sum + value, 0) / landings.length : null,
      scoredFlights: scores.length,
      recordedLandings: landings.length,
    },
    recentTransactions,
    awards: earnedAwards(stats),
  };
}

export async function getPilotPirepDetail(pilotId: string, pirepId: string) {
  return prisma.pirep.findFirst({
    where: { id: pirepId, pilotId, status: "accepted" },
    include: {
      companyExpenses: { orderBy: { type: "asc" } },
      payrollRecord: { include: { walletTransaction: true } },
      flightAnalysisReport: true,
    },
  });
}

export async function getPilotPirepRows(pilotId: string) {
  return prisma.pirep.findMany({
    where: { pilotId, status: "accepted" },
    select: {
      id: true, vamsysPirepId: true, flightNumber: true, callsign: true,
      departure: true, arrival: true, aircraftType: true, network: true,
      flightTimeMinutes: true, landingRate: true, score: true, passengers: true,
      fuelUsed: true, passengerRevenueCents: true, fuelCostCents: true,
      flownAt: true, createdAt: true,
    },
    orderBy: [{ flownAt: "desc" }, { createdAt: "desc" }],
  });
}

export async function getPilotRosterRows() {
  return prisma.pilot.findMany({
    select: { id: true, displayName: true, rankName: true, rankAbbreviation: true, rank: true, base: true, status: true },
    orderBy: { displayName: "asc" },
  });
}

export async function getPilotWalletRows(pilotId: string) {
  return prisma.walletTransaction.findMany({
    where: { pilotId },
    select: { id: true, type: true, amountCents: true, currency: true, description: true, reference: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getPilotPayrollRows(pilotId: string) {
  return prisma.payrollRecord.findMany({
    where: { pilotId },
    include: { pirep: { select: { flightNumber: true, aircraftType: true, flownAt: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getPilotPayrollDetail(pilotId: string, payrollId: string) {
  return prisma.payrollRecord.findFirst({
    where: { id: payrollId, pilotId },
    include: {
      pirep: {
        select: {
          id: true,
          vamsysPirepId: true,
          flightNumber: true,
          departure: true,
          arrival: true,
          aircraftType: true,
          network: true,
          flightTimeMinutes: true,
          landingRate: true,
          score: true,
          flownAt: true,
          passengers: true,
          cargoKg: true,
          passengerRevenueCents: true,
          fuelCostCents: true,
        },
      },
      walletTransaction: true,
    },
  });
}
