import { prisma } from "./prisma";
import { mockPayrollRecords, mockPilots, mockPireps } from "./mock-workflow-data";
import { creditsToCents } from "./payroll-calculation";

export interface PirepRow {
  id: string;
  pilot: string;
  flightNumber: string;
  callsign: string;
  route: string;
  aircraftType: string;
  network: string;
  flightTimeMinutes: number;
  landingRate: number;
  score: number;
  status: string;
  flownAt: Date;
}

export interface PayrollRow {
  id: string;
  pilot: string;
  flightNumber: string;
  aircraftType: string;
  basePayCents: number;
  bonusCents: number;
  penaltyCents: number;
  amountCents: number;
  status: string;
  settlementMonth: string;
}

const databaseConfigured = Boolean(process.env.DATABASE_URL);

export async function getPirepRows(): Promise<PirepRow[]> {
  if (databaseConfigured) {
    try {
      const rows = await prisma.pirep.findMany({ include: { pilot: true }, orderBy: { flownAt: "desc" } });
      return rows.map((row) => ({ id: row.id, pilot: row.pilot.displayName, flightNumber: row.flightNumber, callsign: row.callsign, route: `${row.departure}-${row.arrival}`, aircraftType: row.aircraftType, network: row.network, flightTimeMinutes: row.flightTimeMinutes, landingRate: row.landingRate, score: row.score, status: row.status, flownAt: row.flownAt }));
    } catch (error) {
      console.error("Unable to load PIREPs from PostgreSQL; using mock data.", error);
    }
  }
  return mockPireps.map((row) => ({ id: row.vamsysPirepId, pilot: mockPilots.find((p) => p.vamsysPilotId === row.vamsysPilotId)?.displayName ?? "—", flightNumber: row.flightNumber, callsign: row.callsign, route: `${row.departure}-${row.arrival}`, aircraftType: row.aircraftType, network: row.network, flightTimeMinutes: row.flightTimeMinutes, landingRate: row.landingRate, score: row.score, status: row.status, flownAt: new Date(row.flownAt) }));
}

export async function getPayrollRows(): Promise<PayrollRow[]> {
  if (databaseConfigured) {
    try {
      const rows = await prisma.payrollRecord.findMany({ include: { pilot: true, pirep: true }, orderBy: { createdAt: "desc" } });
      return rows.map((row) => ({ id: row.id, pilot: row.pilot.displayName, flightNumber: row.pirep.flightNumber, aircraftType: row.pirep.aircraftType, basePayCents: row.basePayCents, bonusCents: row.bonusCents, penaltyCents: row.penaltyCents, amountCents: row.amountCents, status: row.status, settlementMonth: row.settlementMonth }));
    } catch (error) {
      console.error("Unable to load payroll from PostgreSQL; using mock data.", error);
    }
  }
  return mockPayrollRecords.map((row) => ({ id: row.id, pilot: row.pilot.displayName, flightNumber: row.flightNumber, aircraftType: row.aircraftType, basePayCents: creditsToCents(row.calculation.basePay), bonusCents: creditsToCents(row.calculation.totalBonus), penaltyCents: creditsToCents(row.calculation.totalPenalty), amountCents: creditsToCents(row.calculation.finalAmount), status: row.status, settlementMonth: row.settlementMonth }));
}

export async function getDashboardSummary() {
  const [pireps, payroll] = await Promise.all([getPirepRows(), getPayrollRows()]);
  const month = new Date().toISOString().slice(0, 7);
  const monthPayroll = payroll.filter((row) => row.settlementMonth === month);
  const amountFor = (status: string) => monthPayroll.filter((row) => row.status === status).reduce((sum, row) => sum + row.amountCents, 0);
  const totals = new Map<string, number>();
  for (const row of monthPayroll) totals.set(row.pilot, (totals.get(row.pilot) ?? 0) + row.amountCents);
  const topPilots = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  return {
    acceptedPireps: pireps.filter((row) => row.status === "accepted" && row.flownAt.toISOString().startsWith(month)).length,
    pendingCents: amountFor("pending"),
    approvedCents: amountFor("approved"),
    paidCents: amountFor("paid"),
    totalCostCents: monthPayroll.reduce((sum, row) => sum + row.amountCents, 0),
    topPilots,
  };
}

export const canMutatePayroll = databaseConfigured;