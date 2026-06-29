import { prisma } from "./prisma";
import { mockPayrollRecords, mockPilots, mockPireps } from "./mock-workflow-data";
import { creditsToCents } from "./payroll/calculatePayroll";
import { calculatePassengerRevenue } from "./revenue/passengerRevenue";

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
  paidAt: Date | null;
  calculation: {
    aircraftBonusCents: number;
    networkBonusCents: number;
    landingBonusCents: number;
    scoreBonusCents: number;
    landingPenaltyCents: number;
    scorePenaltyCents: number;
    explanation: string[];
  };
}

export interface AuditRow {
  id: string;
  createdAt: Date;
  staffName: string;
  action: string;
  entityType: string;
  entityId: string | null;
  message: string;
}

export interface AnnualCompanySummary {
  year: number;
  revenueCents: number;
  expenseCents: number;
  profitCents: number;
  flightCount: number;
  passengers: number;
  cargoKg: number;
  flightHours: number;
  distanceNm: number;
  averageRevenuePerFlightCents: number;
  cargoDataAvailable: boolean;
}

function calculationView(details: unknown): PayrollRow["calculation"] {
  const value = details && typeof details === "object" ? details as Record<string, unknown> : {};
  const cents = (key: string) => typeof value[key] === "number" ? creditsToCents(value[key]) : 0;
  return {
    aircraftBonusCents: cents("aircraftBonus"), networkBonusCents: cents("networkBonus"),
    landingBonusCents: cents("landingBonus"), scoreBonusCents: cents("scoreBonus"),
    landingPenaltyCents: cents("landingPenalty"), scorePenaltyCents: cents("scorePenalty"),
    explanation: Array.isArray(value.explanation) ? value.explanation.filter((line): line is string => typeof line === "string") : [],
  };
}

const databaseConfigured = Boolean(process.env.DATABASE_URL);
const fallbackText = (value: string | null | undefined, fallback = "—") => value && value.trim() ? value : fallback;
const fallbackNumber = (value: number | null | undefined) => value ?? 0;
const fallbackDate = (value: Date | null | undefined, fallback?: Date) => value ?? fallback ?? new Date(0);
const centsSum = (rows: PayrollRow[]) => rows.reduce((sum, row) => sum + row.amountCents, 0);
const sameUtcDay = (date: Date | null, target: Date) => Boolean(date && date.toISOString().slice(0, 10) === target.toISOString().slice(0, 10));
const sameUtcMonth = (date: Date | null, month: string) => Boolean(date && date.toISOString().slice(0, 7) === month);

export async function getPirepRows(): Promise<PirepRow[]> {
  if (databaseConfigured) {
    try {
      const rows = await prisma.pirep.findMany({ include: { pilot: true }, orderBy: { flownAt: "desc" }, take: 200 });
      return rows.map((row) => ({
        id: row.id,
        pilot: row.pilot.displayName,
        flightNumber: fallbackText(row.flightNumber),
        callsign: fallbackText(row.callsign),
        route: `${fallbackText(row.departure)}-${fallbackText(row.arrival)}`,
        aircraftType: fallbackText(row.aircraftType),
        network: fallbackText(row.network),
        flightTimeMinutes: fallbackNumber(row.flightTimeMinutes),
        landingRate: fallbackNumber(row.landingRate),
        score: fallbackNumber(row.score),
        status: row.status,
        flownAt: fallbackDate(row.flownAt, row.createdAt),
      }));
    } catch (error) {
      console.error("Unable to load PIREPs from PostgreSQL; using mock data.", error);
    }
  }
  return mockPireps.map((row) => ({ id: row.vamsysPirepId, pilot: mockPilots.find((p) => p.vamsysPilotId === row.vamsysPilotId)?.displayName ?? "—", flightNumber: row.flightNumber, callsign: row.callsign, route: `${row.departure}-${row.arrival}`, aircraftType: row.aircraftType, network: row.network, flightTimeMinutes: row.flightTimeMinutes, landingRate: row.landingRate, score: row.score, status: row.status, flownAt: new Date(row.flownAt) }));
}

export async function getPayrollRows(): Promise<PayrollRow[]> {
  if (databaseConfigured) {
    try {
      const rows = await prisma.payrollRecord.findMany({ include: { pilot: true, pirep: true }, orderBy: { createdAt: "desc" }, take: 200 });
      return rows.map((row) => ({
        id: row.id,
        pilot: row.pilot.displayName,
        flightNumber: fallbackText(row.pirep.flightNumber),
        aircraftType: fallbackText(row.pirep.aircraftType),
        basePayCents: row.basePayCents,
        bonusCents: row.bonusCents,
        penaltyCents: row.penaltyCents,
        amountCents: row.amountCents,
        status: row.status,
        settlementMonth: row.settlementMonth,
        paidAt: row.paidAt,
        calculation: calculationView(row.calculationDetails),
      }));
    } catch (error) {
      console.error("Unable to load payroll from PostgreSQL; using mock data.", error);
    }
  }
  return mockPayrollRecords.map((row) => ({ id: row.id, pilot: row.pilot.displayName, flightNumber: row.flightNumber, aircraftType: row.aircraftType, basePayCents: creditsToCents(row.calculation.basePay), bonusCents: creditsToCents(row.calculation.totalBonus), penaltyCents: creditsToCents(row.calculation.totalPenalty), amountCents: creditsToCents(row.calculation.finalAmount), status: row.status, settlementMonth: row.settlementMonth, paidAt: row.status === "paid" ? new Date() : null, calculation: calculationView(row.calculation) }));
}

const mockAircraftPassengers: Record<string, number> = { A320: 150, A321: 185, A359: 290, A388: 480, B772: 320 };
const mockRouteDistances: Record<string, number> = {
  "LEMD-LEBL": 270,
  "LEVC-LEMD": 160,
  "LEBL-GCTS": 1180,
  "LEMD-EGLL": 680,
  "LEVC-LEPA": 170,
};

function mockPirepPassengers(row: (typeof mockPireps)[number]) {
  return mockAircraftPassengers[row.aircraftType] ?? 150;
}

function mockPirepDistance(row: (typeof mockPireps)[number]) {
  return mockRouteDistances[`${row.departure}-${row.arrival}`] ?? Math.max(100, Math.round(row.flightTimeMinutes * 7));
}

function mockAnnualCompanySummary(year: number, payroll: PayrollRow[]): AnnualCompanySummary {
  const yearPireps = mockPireps.filter((row) => row.status === "accepted" && new Date(row.flownAt).getUTCFullYear() === year);
  const enrichedPireps = yearPireps.map((row) => ({ passengers: mockPirepPassengers(row), distanceNm: mockPirepDistance(row), flightTimeMinutes: row.flightTimeMinutes }));
  const revenueCents = enrichedPireps.reduce((sum, row) => sum + calculatePassengerRevenue(row.passengers, row.distanceNm).revenueCents, 0);
  const expenseCents = payroll.filter((row) => row.settlementMonth.startsWith(String(year))).reduce((sum, row) => sum + row.amountCents, 0);
  const flightTimeMinutes = enrichedPireps.reduce((sum, row) => sum + row.flightTimeMinutes, 0);
  return {
    year,
    revenueCents,
    expenseCents,
    profitCents: revenueCents - expenseCents,
    flightCount: yearPireps.length,
    passengers: enrichedPireps.reduce((sum, row) => sum + row.passengers, 0),
    cargoKg: 0,
    flightHours: Math.round((flightTimeMinutes / 60) * 10) / 10,
    distanceNm: enrichedPireps.reduce((sum, row) => sum + row.distanceNm, 0),
    averageRevenuePerFlightCents: yearPireps.length ? Math.round(revenueCents / yearPireps.length) : 0,
    cargoDataAvailable: false,
  };
}

async function getAnnualCompanySummary(payroll: PayrollRow[], year = new Date().getUTCFullYear()): Promise<AnnualCompanySummary> {
  if (databaseConfigured) {
    try {
      const start = new Date(Date.UTC(year, 0, 1));
      const end = new Date(Date.UTC(year + 1, 0, 1));
      const [pirepStats, payrollStats] = await Promise.all([
        prisma.pirep.aggregate({
          where: { status: "accepted", flownAt: { gte: start, lt: end } },
          _count: { _all: true },
          _sum: { passengers: true, passengerRevenueCents: true, flightTimeMinutes: true, flightDistanceNm: true },
        }),
        prisma.payrollRecord.aggregate({
          where: { settlementMonth: { startsWith: String(year) } },
          _sum: { amountCents: true },
        }),
      ]);
      const flightCount = pirepStats._count._all;
      const revenueCents = pirepStats._sum.passengerRevenueCents ?? 0;
      const expenseCents = payrollStats._sum.amountCents ?? 0;
      const flightTimeMinutes = pirepStats._sum.flightTimeMinutes ?? 0;
      return {
        year,
        revenueCents,
        expenseCents,
        profitCents: revenueCents - expenseCents,
        flightCount,
        passengers: pirepStats._sum.passengers ?? 0,
        cargoKg: 0,
        flightHours: Math.round((flightTimeMinutes / 60) * 10) / 10,
        distanceNm: pirepStats._sum.flightDistanceNm ?? 0,
        averageRevenuePerFlightCents: flightCount ? Math.round(revenueCents / flightCount) : 0,
        cargoDataAvailable: false,
      };
    } catch (error) {
      console.error("Unable to load annual company metrics from PostgreSQL; using mock data.", error);
    }
  }
  return mockAnnualCompanySummary(year, payroll);
}

export async function getDashboardSummary() {
  const [pireps, payroll] = await Promise.all([getPirepRows(), getPayrollRows()]);
  const now = new Date();
  const month = now.toISOString().slice(0, 7);
  const monthPayroll = payroll.filter((row) => row.settlementMonth === month);
  const paidThisMonth = payroll.filter((row) => row.status === "paid" && sameUtcMonth(row.paidAt, month));
  const paidToday = payroll.filter((row) => row.status === "paid" && sameUtcDay(row.paidAt, now));
  const pendingPayroll = payroll.filter((row) => row.status === "pending");
  const approvedPayroll = payroll.filter((row) => row.status === "approved");
  const rankingSource = paidThisMonth.length ? paidThisMonth : monthPayroll;
  const totals = new Map<string, number>();
  for (const row of rankingSource) totals.set(row.pilot, (totals.get(row.pilot) ?? 0) + row.amountCents);
  const topPilots = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const annualCompany = await getAnnualCompanySummary(payroll);
  return {
    acceptedPireps: pireps.filter((row) => row.status === "accepted" && row.flownAt.toISOString().startsWith(month)).length,
    pendingCents: centsSum(pendingPayroll),
    approvedCents: centsSum(approvedPayroll),
    paidCents: centsSum(paidThisMonth),
    paidTodayCents: centsSum(paidToday),
    totalCostCents: centsSum(monthPayroll),
    pendingReviewCount: pendingPayroll.length,
    approvedPaymentCount: approvedPayroll.length,
    paidThisMonthCount: paidThisMonth.length,
    paidTodayCount: paidToday.length,
    topPilots,
    annualCompany,
  };
}

export async function getAuditRows(filters: { action?: string; staffUserId?: string } = {}): Promise<AuditRow[]> {
  if (databaseConfigured) {
    try {
      const rows = await prisma.aocAuditLog.findMany({
        where: { action: filters.action || undefined, staffUserId: filters.staffUserId || undefined },
        include: { staffUser: true },
        orderBy: { createdAt: "desc" },
        take: 200,
      });
      return rows.map((row) => ({ id: row.id, createdAt: row.createdAt, staffName: row.staffUser?.name ?? "Sistema / Piloto", action: row.action, entityType: row.entityType, entityId: row.entityId, message: row.message }));
    } catch (error) {
      console.error("Unable to load audit logs from PostgreSQL; using mock data.", error);
    }
  }
  return [
    { id: "audit-demo-1", createdAt: new Date("2026-06-28T18:10:00Z"), staffName: "María Administradora", action: "PAYROLL_APPROVED", entityType: "PayrollRecord", entityId: "MOCK-PAY-001", message: "María Administradora aprobó una nómina de demostración." },
    { id: "audit-demo-2", createdAt: new Date("2026-06-28T18:14:00Z"), staffName: "Carlos Finanzas", action: "PAYROLL_MARKED_PAID", entityType: "PayrollRecord", entityId: "MOCK-PAY-003", message: "Carlos Finanzas marcó una nómina de demostración como pagada." },
  ].filter((row) => !filters.action || row.action === filters.action);
}

export async function getAuditFilterOptions() {
  if (!databaseConfigured) return { actions: ["PAYROLL_APPROVED", "PAYROLL_MARKED_PAID"], staff: [] as { id: string; name: string }[] };
  try {
    const [actions, staff] = await Promise.all([
      prisma.aocAuditLog.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" }, take: 100 }),
      prisma.staffUser.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" }, take: 100 }),
    ]);
    return { actions: actions.map((row) => row.action), staff };
  } catch (error) {
    console.error("Unable to load audit filters.", error);
    return { actions: [], staff: [] };
  }
}

export const canMutatePayroll = databaseConfigured;
