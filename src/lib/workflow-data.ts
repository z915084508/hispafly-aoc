import { prisma } from "./prisma";
import { creditsToCents } from "./payroll/calculatePayroll";

export interface PirepRow {
  id: string;
  pilot: string;
  flightNumber: string | null;
  callsign: string | null;
  route: string;
  aircraftType: string | null;
  network: string | null;
  flightTimeMinutes: number | null;
  landingRate: number | null;
  score: number | null;
  status: string;
  flownAt: Date | null;
  source: string;
  synchronizedAt: Date;
  passengers: number | null;
  flightDistanceNm: number | null;
  passengerRevenueCents: number | null;
}

export interface PilotRow {
  id: string;
  externalId: string;
  name: string;
  callsign: string | null;
  rank: string;
  base: string;
  status: string;
  balanceCents: number;
  connectionStatus: "connected" | "expired" | "revoked" | "disconnected";
  lastPirepSyncAt: Date | null;
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

export interface DashboardSummary {
  acceptedPireps: number;
  totalPassengers: number;
  passengerRevenueCents: number;
  pendingCents: number;
  approvedCents: number;
  paidCents: number;
  paidTodayCents: number;
  totalCostCents: number;
  pendingReviewCount: number;
  approvedPaymentCount: number;
  paidThisMonthCount: number;
  paidTodayCount: number;
  topPilots: [string, number][];
  connectedVamsysPilots: number;
  lastPirepSyncAt: Date | null;
  newVamsysPirepsToday: number;
  payrollGeneratedToday: number;
}

const databaseConfigured = Boolean(process.env.DATABASE_URL);
const DASHBOARD_TIME_ZONE = "Europe/Madrid";

const dash = "—";

function route(departure: string | null, arrival: string | null) {
  return departure || arrival ? `${departure ?? dash}–${arrival ?? dash}` : dash;
}

function startOfMonthUtc(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function startOfNextMonthUtc(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

function startOfDayInMadrid(now = new Date()) {
  const madridDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: DASHBOARD_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return new Date(`${madridDate}T00:00:00.000+01:00`);
}

function calculationView(details: unknown): PayrollRow["calculation"] {
  const value = details && typeof details === "object" ? details as Record<string, unknown> : {};
  const cents = (key: string) => typeof value[key] === "number" ? creditsToCents(value[key]) : 0;
  return {
    aircraftBonusCents: cents("aircraftBonus"),
    networkBonusCents: cents("networkBonus"),
    landingBonusCents: cents("landingBonus"),
    scoreBonusCents: cents("scoreBonus"),
    landingPenaltyCents: cents("landingPenalty"),
    scorePenaltyCents: cents("scorePenalty"),
    explanation: Array.isArray(value.explanation)
      ? value.explanation.filter((line): line is string => typeof line === "string")
      : [],
  };
}

export async function getPirepRows(): Promise<PirepRow[]> {
  if (!databaseConfigured) return [];
  try {
    const rows = await prisma.pirep.findMany({
      include: { pilot: true },
      orderBy: [{ flownAt: "desc" }, { createdAt: "desc" }],
      take: 500,
    });
    return rows.map((row) => ({
      id: row.id,
      pilot: row.pilot.displayName,
      flightNumber: row.flightNumber,
      callsign: row.callsign,
      route: route(row.departure, row.arrival),
      aircraftType: row.aircraftType,
      network: row.network,
      flightTimeMinutes: row.flightTimeMinutes,
      landingRate: row.landingRate,
      score: row.score,
      status: row.status,
      flownAt: row.flownAt,
      source: row.source,
      synchronizedAt: row.synchronizedAt,
      passengers: row.passengers,
      flightDistanceNm: row.flightDistanceNm,
      passengerRevenueCents: row.passengerRevenueCents,
    }));
  } catch (error) {
    console.error("Unable to load PIREPs from PostgreSQL.", error);
    return [];
  }
}

export async function getPilotRows(): Promise<PilotRow[]> {
  if (!databaseConfigured) return [];
  try {
    const rows = await prisma.pilot.findMany({
      include: { vamsysOAuthToken: { select: { expiresAt: true, revokedAt: true } } },
      orderBy: { displayName: "asc" },
    });
    const now = new Date();
    return rows.map((row) => ({
      id: row.id,
      externalId: row.vamsysPilotId,
      name: row.displayName,
      callsign: row.callsign,
      rank: row.rankName ?? row.rankAbbreviation ?? row.rank ?? dash,
      base: row.base ?? (/^[A-Z]{4}$/i.test(row.hubId ?? "") ? row.hubId!.toUpperCase() : dash),
      status: row.status,
      balanceCents: row.walletBalanceCents,
      connectionStatus: !row.vamsysOAuthToken
        ? "disconnected"
        : row.vamsysOAuthToken.revokedAt
          ? "revoked"
          : row.vamsysOAuthToken.expiresAt <= now
            ? "expired"
            : "connected",
      lastPirepSyncAt: row.lastPirepSyncAt,
    }));
  } catch (error) {
    console.error("Unable to load pilots from PostgreSQL.", error);
    return [];
  }
}

export async function getPayrollRows(): Promise<PayrollRow[]> {
  if (!databaseConfigured) return [];
  try {
    const rows = await prisma.payrollRecord.findMany({
      include: { pilot: true, pirep: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    return rows.map((row) => ({
      id: row.id,
      pilot: row.pilot.displayName,
      flightNumber: row.pirep.flightNumber ?? dash,
      aircraftType: row.pirep.aircraftType ?? dash,
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
    console.error("Unable to load payroll from PostgreSQL.", error);
    return [];
  }
}

async function getSyncMetrics() {
  const empty = {
    connectedVamsysPilots: 0,
    lastPirepSyncAt: null as Date | null,
    newVamsysPirepsToday: 0,
    payrollGeneratedToday: 0,
  };
  if (!databaseConfigured) return empty;
  try {
    const today = startOfDayInMadrid();
    const [connectedVamsysPilots, state, newVamsysPirepsToday, payrollGeneratedToday] = await Promise.all([
      prisma.vamsysOAuthToken.count({ where: { revokedAt: null } }),
      prisma.operationsApiState.findUnique({ where: { id: "vamsys" }, select: { lastPirepSyncAt: true, lastCronPirepSyncAt: true } }).catch(() => null),
      prisma.pirep.count({ where: { source: { startsWith: "vamsys" }, createdAt: { gte: today } } }),
      prisma.payrollRecord.count({ where: { createdAt: { gte: today }, pirep: { source: { startsWith: "vamsys" } } } }),
    ]);
    return {
      connectedVamsysPilots,
      lastPirepSyncAt: state?.lastCronPirepSyncAt ?? state?.lastPirepSyncAt ?? null,
      newVamsysPirepsToday,
      payrollGeneratedToday,
    };
  } catch (error) {
    console.error("Unable to load synchronization metrics.", error);
    return empty;
  }
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  if (!databaseConfigured) {
    return {
      acceptedPireps: 0,
      totalPassengers: 0,
      passengerRevenueCents: 0,
      pendingCents: 0,
      approvedCents: 0,
      paidCents: 0,
      paidTodayCents: 0,
      totalCostCents: 0,
      pendingReviewCount: 0,
      approvedPaymentCount: 0,
      paidThisMonthCount: 0,
      paidTodayCount: 0,
      topPilots: [],
      ...(await getSyncMetrics()),
    };
  }

  try {
    const monthStart = startOfMonthUtc();
    const nextMonthStart = startOfNextMonthUtc();
    const todayStart = startOfDayInMadrid();
    const settlementMonth = monthStart.toISOString().slice(0, 7);

    const [
      pirepMonth,
      payrollByStatus,
      pendingReviewCount,
      approvedPaymentCount,
      paidThisMonth,
      paidToday,
      topPilotPayroll,
      sync,
    ] = await Promise.all([
      prisma.pirep.aggregate({
        where: { status: "accepted", flownAt: { gte: monthStart, lt: nextMonthStart } },
        _count: { _all: true },
        _sum: { passengers: true, passengerRevenueCents: true },
      }),
      prisma.payrollRecord.groupBy({
        by: ["status"],
        where: { settlementMonth },
        _sum: { amountCents: true },
      }),
      prisma.payrollRecord.count({ where: { status: "pending" } }),
      prisma.payrollRecord.count({ where: { status: "approved" } }),
      prisma.payrollRecord.aggregate({
        where: { status: "paid", paidAt: { gte: monthStart, lt: nextMonthStart } },
        _count: { _all: true },
        _sum: { amountCents: true },
      }),
      prisma.payrollRecord.aggregate({
        where: { status: "paid", paidAt: { gte: todayStart } },
        _count: { _all: true },
        _sum: { amountCents: true },
      }),
      prisma.payrollRecord.groupBy({
        by: ["pilotId"],
        where: { status: "paid", paidAt: { gte: monthStart, lt: nextMonthStart } },
        _sum: { amountCents: true },
        orderBy: { _sum: { amountCents: "desc" } },
        take: 5,
      }),
      getSyncMetrics(),
    ]);

    const amountFor = (status: string) => payrollByStatus.find((row) => row.status === status)?._sum.amountCents ?? 0;
    const topPilots = await prisma.pilot.findMany({
      where: { id: { in: topPilotPayroll.map((row) => row.pilotId) } },
      select: { id: true, displayName: true },
    });
    const pilotNames = new Map(topPilots.map((pilot) => [pilot.id, pilot.displayName]));

    return {
      acceptedPireps: pirepMonth._count._all,
      totalPassengers: pirepMonth._sum.passengers ?? 0,
      passengerRevenueCents: pirepMonth._sum.passengerRevenueCents ?? 0,
      pendingCents: amountFor("pending"),
      approvedCents: amountFor("approved"),
      paidCents: paidThisMonth._sum.amountCents ?? 0,
      paidTodayCents: paidToday._sum.amountCents ?? 0,
      totalCostCents: payrollByStatus.reduce((sum, row) => sum + (row._sum.amountCents ?? 0), 0),
      pendingReviewCount,
      approvedPaymentCount,
      paidThisMonthCount: paidThisMonth._count._all,
      paidTodayCount: paidToday._count._all,
      topPilots: topPilotPayroll.map((row) => [pilotNames.get(row.pilotId) ?? "Piloto", row._sum.amountCents ?? 0]),
      ...sync,
    };
  } catch (error) {
    console.error("Unable to load dashboard summary from PostgreSQL.", error);
    return {
      acceptedPireps: 0,
      totalPassengers: 0,
      passengerRevenueCents: 0,
      pendingCents: 0,
      approvedCents: 0,
      paidCents: 0,
      paidTodayCents: 0,
      totalCostCents: 0,
      pendingReviewCount: 0,
      approvedPaymentCount: 0,
      paidThisMonthCount: 0,
      paidTodayCount: 0,
      topPilots: [],
      ...(await getSyncMetrics()),
    };
  }
}

export async function getAuditRows(filters: { action?: string; staffUserId?: string } = {}): Promise<AuditRow[]> {
  if (!databaseConfigured) return [];
  try {
    const rows = await prisma.aocAuditLog.findMany({
      where: { action: filters.action || undefined, staffUserId: filters.staffUserId || undefined },
      include: { staffUser: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      staffName: row.staffUser?.name ?? "Sistema",
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      message: row.message,
    }));
  } catch (error) {
    console.error("Unable to load audit logs.", error);
    return [];
  }
}

export async function getAuditFilterOptions() {
  if (!databaseConfigured) return { actions: [] as string[], staff: [] as { id: string; name: string }[] };
  try {
    const [actions, staff] = await Promise.all([
      prisma.aocAuditLog.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
      prisma.staffUser.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ]);
    return { actions: actions.map((row) => row.action), staff };
  } catch (error) {
    console.error("Unable to load audit filters.", error);
    return { actions: [], staff: [] as { id: string; name: string }[] };
  }
}

export const canMutatePayroll = databaseConfigured;
