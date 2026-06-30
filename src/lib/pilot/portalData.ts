import { prisma } from "@/lib/prisma";

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

export async function getPilotPirepDetail(pilotId: string, pirepId: string) {
  return prisma.pirep.findFirst({
    where: { id: pirepId, pilotId },
    include: { payrollRecord: true },
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
