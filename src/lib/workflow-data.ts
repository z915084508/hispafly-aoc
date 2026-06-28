import { prisma } from "./prisma";
import { mockPayrollRecords, mockPilots, mockPireps } from "./mock-workflow-data";
import { creditsToCents } from "./payroll/calculatePayroll";

export interface PirepRow {
  id: string; pilot: string; flightNumber: string | null; callsign: string | null;
  route: string; aircraftType: string | null; network: string | null;
  flightTimeMinutes: number | null; landingRate: number | null; score: number | null;
  status: string; flownAt: Date | null; source: string; synchronizedAt: Date;
}

export interface PilotRow {
  id: string; externalId: string; name: string; callsign: string | null; rank: string;
  base: string; status: string; balanceCents: number; connectionStatus: "connected" | "expired" | "revoked" | "disconnected";
  lastPirepSyncAt: Date | null;
}

export interface PayrollRow {
  id: string; pilot: string; flightNumber: string; aircraftType: string; basePayCents: number;
  bonusCents: number; penaltyCents: number; amountCents: number; status: string; settlementMonth: string;
  calculation: { aircraftBonusCents: number; networkBonusCents: number; landingBonusCents: number; scoreBonusCents: number; landingPenaltyCents: number; scorePenaltyCents: number; explanation: string[] };
}

export interface AuditRow { id: string; createdAt: Date; staffName: string; action: string; entityType: string; entityId: string | null; message: string }

function calculationView(details: unknown): PayrollRow["calculation"] {
  const value = details && typeof details === "object" ? details as Record<string, unknown> : {};
  const cents = (key: string) => typeof value[key] === "number" ? creditsToCents(value[key]) : 0;
  return { aircraftBonusCents: cents("aircraftBonus"), networkBonusCents: cents("networkBonus"), landingBonusCents: cents("landingBonus"), scoreBonusCents: cents("scoreBonus"), landingPenaltyCents: cents("landingPenalty"), scorePenaltyCents: cents("scorePenalty"), explanation: Array.isArray(value.explanation) ? value.explanation.filter((line): line is string => typeof line === "string") : [] };
}

const databaseConfigured = Boolean(process.env.DATABASE_URL);
const route = (departure: string | null, arrival: string | null) => departure || arrival ? `${departure ?? "—"}–${arrival ?? "—"}` : "—";

export async function getPirepRows(): Promise<PirepRow[]> {
  if (databaseConfigured) try {
    const rows = await prisma.pirep.findMany({ include: { pilot: true }, orderBy: [{ flownAt: "desc" }, { createdAt: "desc" }] });
    return rows.map((row) => ({ id: row.id, pilot: row.pilot.displayName, flightNumber: row.flightNumber, callsign: row.callsign, route: route(row.departure, row.arrival), aircraftType: row.aircraftType, network: row.network, flightTimeMinutes: row.flightTimeMinutes, landingRate: row.landingRate, score: row.score, status: row.status, flownAt: row.flownAt, source: row.source, synchronizedAt: row.synchronizedAt }));
  } catch (error) { console.error("Unable to load PIREPs from PostgreSQL; using mock data.", error); }
  return mockPireps.map((row) => ({ id: row.vamsysPirepId, pilot: mockPilots.find((p) => p.vamsysPilotId === row.vamsysPilotId)?.displayName ?? "—", flightNumber: row.flightNumber, callsign: row.callsign, route: route(row.departure, row.arrival), aircraftType: row.aircraftType, network: row.network, flightTimeMinutes: row.flightTimeMinutes, landingRate: row.landingRate, score: row.score, status: row.status, flownAt: new Date(row.flownAt), source: "mock", synchronizedAt: new Date(row.flownAt) }));
}

export async function getPilotRows(): Promise<PilotRow[]> {
  if (databaseConfigured) try {
    const rows = await prisma.pilot.findMany({ include: { vamsysOAuthToken: { select: { expiresAt: true, revokedAt: true } } }, orderBy: { displayName: "asc" } });
    const now = new Date();
    return rows.map((row) => ({ id: row.id, externalId: row.vamsysPilotId, name: row.displayName, callsign: row.callsign, rank: row.rankName ?? row.rank ?? "—", base: row.hubId ?? row.base ?? "—", status: row.status, balanceCents: row.walletBalanceCents, connectionStatus: !row.vamsysOAuthToken ? "disconnected" : row.vamsysOAuthToken.revokedAt ? "revoked" : row.vamsysOAuthToken.expiresAt <= now ? "expired" : "connected", lastPirepSyncAt: row.lastPirepSyncAt }));
  } catch (error) { console.error("Unable to load pilots from PostgreSQL; using mock data.", error); }
  return mockPilots.map((row) => ({ id: row.vamsysPilotId, externalId: row.vamsysPilotId, name: row.displayName, callsign: row.callsign, rank: row.rank, base: row.base, status: "active", balanceCents: 0, connectionStatus: "disconnected", lastPirepSyncAt: null }));
}

export async function getPayrollRows(): Promise<PayrollRow[]> {
  if (databaseConfigured) try {
    const rows = await prisma.payrollRecord.findMany({ include: { pilot: true, pirep: true }, orderBy: { createdAt: "desc" } });
    return rows.map((row) => ({ id: row.id, pilot: row.pilot.displayName, flightNumber: row.pirep.flightNumber ?? "—", aircraftType: row.pirep.aircraftType ?? "—", basePayCents: row.basePayCents, bonusCents: row.bonusCents, penaltyCents: row.penaltyCents, amountCents: row.amountCents, status: row.status, settlementMonth: row.settlementMonth, calculation: calculationView(row.calculationDetails) }));
  } catch (error) { console.error("Unable to load payroll from PostgreSQL; using mock data.", error); }
  return mockPayrollRecords.map((row) => ({ id: row.id, pilot: row.pilot.displayName, flightNumber: row.flightNumber, aircraftType: row.aircraftType, basePayCents: creditsToCents(row.calculation.basePay), bonusCents: creditsToCents(row.calculation.totalBonus), penaltyCents: creditsToCents(row.calculation.totalPenalty), amountCents: creditsToCents(row.calculation.finalAmount), status: row.status, settlementMonth: row.settlementMonth, calculation: calculationView(row.calculation) }));
}

async function getSyncMetrics() {
  const empty = { connectedVamsysPilots: 0, lastPirepSyncAt: null as Date | null, newVamsysPirepsToday: 0, payrollGeneratedToday: 0 };
  if (!databaseConfigured) return empty;
  try {
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const [connectedVamsysPilots, lastSync, newVamsysPirepsToday, payrollGeneratedToday] = await Promise.all([
      prisma.vamsysOAuthToken.count({ where: { revokedAt: null } }),
      prisma.pilot.findFirst({ where: { lastPirepSyncAt: { not: null } }, orderBy: { lastPirepSyncAt: "desc" }, select: { lastPirepSyncAt: true } }),
      prisma.pirep.count({ where: { source: "vamsys", createdAt: { gte: today } } }),
      prisma.payrollRecord.count({ where: { createdAt: { gte: today }, pirep: { source: "vamsys" } } }),
    ]);
    return { connectedVamsysPilots, lastPirepSyncAt: lastSync?.lastPirepSyncAt ?? null, newVamsysPirepsToday, payrollGeneratedToday };
  } catch (error) { console.error("Unable to load vAMSYS synchronization metrics.", error); return empty; }
}

export async function getDashboardSummary() {
  const [pireps, payroll, sync] = await Promise.all([getPirepRows(), getPayrollRows(), getSyncMetrics()]);
  const month = new Date().toISOString().slice(0, 7); const monthPayroll = payroll.filter((row) => row.settlementMonth === month);
  const amountFor = (status: string) => monthPayroll.filter((row) => row.status === status).reduce((sum, row) => sum + row.amountCents, 0);
  const totals = new Map<string, number>(); for (const row of monthPayroll) totals.set(row.pilot, (totals.get(row.pilot) ?? 0) + row.amountCents);
  return { acceptedPireps: pireps.filter((row) => row.status === "accepted" && row.flownAt?.toISOString().startsWith(month)).length, pendingCents: amountFor("pending"), approvedCents: amountFor("approved"), paidCents: amountFor("paid"), totalCostCents: monthPayroll.reduce((sum, row) => sum + row.amountCents, 0), pendingReviewCount: payroll.filter((row) => row.status === "pending").length, approvedPaymentCount: payroll.filter((row) => row.status === "approved").length, paidThisMonthCount: monthPayroll.filter((row) => row.status === "paid").length, topPilots: [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5), ...sync };
}

export async function getAuditRows(filters: { action?: string; staffUserId?: string } = {}): Promise<AuditRow[]> {
  if (databaseConfigured) try {
    const rows = await prisma.aocAuditLog.findMany({ where: { action: filters.action || undefined, staffUserId: filters.staffUserId || undefined }, include: { staffUser: true }, orderBy: { createdAt: "desc" }, take: 200 });
    return rows.map((row) => ({ id: row.id, createdAt: row.createdAt, staffName: row.staffUser?.name ?? "Sistema / Piloto", action: row.action, entityType: row.entityType, entityId: row.entityId, message: row.message }));
  } catch (error) { console.error("Unable to load audit logs from PostgreSQL; using mock data.", error); }
  return [{ id: "audit-demo-1", createdAt: new Date(), staffName: "María Administradora", action: "PAYROLL_APPROVED", entityType: "PayrollRecord", entityId: "MOCK-PAY-001", message: "María Administradora aprobó una nómina de demostración." }].filter((row) => !filters.action || row.action === filters.action);
}

export async function getAuditFilterOptions() {
  if (!databaseConfigured) return { actions: ["PAYROLL_APPROVED"], staff: [] as { id: string; name: string }[] };
  try { const [actions, staff] = await Promise.all([prisma.aocAuditLog.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }), prisma.staffUser.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } })]); return { actions: actions.map((row) => row.action), staff }; }
  catch (error) { console.error("Unable to load audit filters.", error); return { actions: [], staff: [] }; }
}

export const canMutatePayroll = databaseConfigured;
