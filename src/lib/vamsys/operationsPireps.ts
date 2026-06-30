import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLogSafely } from "@/lib/audit/log";
import { calculatePayroll, creditsToCents } from "@/lib/payroll/calculatePayroll";
import { payrollRulesFromStoredRule } from "@/lib/payroll/rules";
import { calculateFuelCostSnapshot } from "@/lib/economy/fuel";
import { calculatePassengerRevenue } from "@/lib/revenue/passengerRevenue";
import { generateCompanyExpensesForPirep } from "@/lib/economy/companyExpenses";
import { operationsRequest } from "./operations";
import { nextVamsysCursor, nextVamsysPageUrl } from "./pagination";
import { isCompletedOperationsPirep, mergeOperationsPirepRecords, operationsPirepStatus } from "./operationsPirepPayload";

type Row = Record<string, unknown>;

export interface OperationsPirepSyncResult {
  importedCount: number;
  updatedCount: number;
  skippedCount: number;
  payrollGeneratedCount: number;
  expensesGeneratedCount: number;
  walletTransactionsCount: number;
  errors: string[];
}

export interface ProcessAcceptedOperationsPirepResult {
  imported: boolean;
  updated: boolean;
  payrollGenerated: boolean;
  walletTransactionCreated: boolean;
  expensesGenerated: number;
  pirepId: string;
  vamsysPirepId: string;
}

const emptyResult = (): OperationsPirepSyncResult => ({
  importedCount: 0,
  updatedCount: 0,
  skippedCount: 0,
  payrollGeneratedCount: 0,
  expensesGeneratedCount: 0,
  walletTransactionsCount: 0,
  errors: [],
});

const rec = (v: unknown): Row | null => v && typeof v === "object" && !Array.isArray(v) ? v as Row : null;
const str = (r: Row, ...keys: string[]) => {
  for (const k of keys) if (typeof r[k] === "string" || typeof r[k] === "number") return String(r[k]);
  return null;
};
const num = (r: Row, ...keys: string[]) => {
  const value = str(r, ...keys);
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const date = (r: Row, ...keys: string[]) => {
  const value = str(r, ...keys);
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const nested = (r: Row, key: string) => rec(r[key]);
const minutes = (seconds: number | null) => seconds === null ? null : Math.round(seconds / 60);

function payloadFromBody(body: unknown) {
  const root = rec(body);
  return rec(root?.data) ?? root;
}

function extractPirepId(input: string | Row) {
  if (typeof input === "string") return input;
  const attributes = rec(input.attributes) ?? {};
  const source = { ...attributes, ...input };
  return str(source, "id", "pirep_id", "pirepId", "uuid");
}

export function mapOperationsPirep(raw: Row) {
  const id = str(raw, "id", "pirep_id", "pirepId", "uuid");
  if (!id) throw new Error("PIREP Operations sin identificador.");

  const attributes = rec(raw.attributes) ?? {};
  const source = { ...attributes, ...raw };
  const status = operationsPirepStatus(raw);
  if (!isCompletedOperationsPirep(raw)) throw new Error(`PIREP ${id} omitido por estado ${status ?? "desconocido"}.`);

  const booking = nested(source, "booking");
  const fleet = nested(source, "fleet") ?? (booking ? nested(booking, "fleet") : null);
  const aircraft = nested(source, "aircraft") ?? (booking ? nested(booking, "aircraft") : null);
  const departure = nested(source, "departure_airport") ?? (booking ? nested(booking, "departure") : null);
  const arrival = nested(source, "arrival_airport") ?? (booking ? nested(booking, "arrival") : null);
  const passengersValue = num(source, "passengers", "passenger_count") ?? (booking ? num(booking, "passengers", "passenger_count") : null);
  const distanceValue = num(source, "flight_distance", "distance", "distance_nm");
  const cargoValue = num(source, "cargo", "cargo_kg", "cargoKg", "cargo_weight", "cargoWeight", "freight", "freight_kg", "freight_weight", "freightWeight", "payload", "payload_kg")
    ?? (booking ? num(booking, "cargo", "cargo_kg", "cargoKg", "cargo_weight", "cargoWeight", "freight", "freight_kg", "freight_weight", "freightWeight", "payload", "payload_kg") : null);
  const fuelUsedValue = num(source, "fuel_used", "fuelUsed", "fuel_used_kg", "fuel");
  const passengers = passengersValue === null ? null : Math.round(passengersValue);
  const flightDistanceNm = distanceValue === null ? null : Math.round(distanceValue);
  const passengerRevenueCents = passengers !== null && flightDistanceNm !== null ? calculatePassengerRevenue(passengers, flightDistanceNm).revenueCents : null;
  const fuelUsed = fuelUsedValue === null ? null : Math.round(fuelUsedValue);
  const cargoKg = cargoValue === null ? null : Math.round(cargoValue);
  const aircraftType = fleet ? str(fleet, "code", "icao", "name", "type") : aircraft ? str(aircraft, "type", "icao", "aircraft_type", "aircraftType") : str(source, "aircraft_type", "aircraftType");

  return {
    pilotExternalId: str(source, "pilot_id", "pilotId", "pilot_uuid") ?? (booking ? str(booking, "pilot_id", "pilotId") : null),
    data: {
      vamsysPirepId: id,
      flightNumber: str(source, "flight_number", "flightNumber"),
      callsign: str(source, "callsign"),
      departure: departure ? str(departure, "icao", "ident", "code", "id") : str(source, "departure_airport_id", "departure", "departure_icao"),
      arrival: arrival ? str(arrival, "icao", "ident", "code", "id") : str(source, "arrival_airport_id", "arrival", "arrival_icao"),
      aircraftType,
      network: str(source, "network"),
      flightTimeMinutes: minutes(num(source, "flight_length", "flightLength")),
      blockTimeMinutes: minutes(num(source, "block_length", "blockLength")),
      landingRate: num(source, "landing_rate", "landingRate") === null ? null : Math.round(num(source, "landing_rate", "landingRate")!),
      score: num(source, "points", "score") === null ? null : Math.round(num(source, "points", "score")!),
      fuelUsed,
      points: num(source, "points", "score"),
      credits: num(source, "bonus_sum", "credits"),
      passengers,
      cargoKg,
      flightDistanceNm,
      passengerRevenueCents,
      status: "accepted" as const,
      acarsSoftware: str(source, "acars_version", "acarsSoftware"),
      source: "vamsys_operations",
      flownAt: date(source, "landing_time", "on_blocks_time", "created_at", "flown_at"),
      acceptedAt: date(source, "updated_at", "accepted_at"),
      vamsysCreatedAt: date(source, "created_at"),
      vamsysUpdatedAt: date(source, "updated_at"),
      rawData: raw as Prisma.InputJsonValue,
      synchronizedAt: new Date(),
    },
  };
}

async function fetchPirepDetail(pirepId: string) {
  const body = await operationsRequest(`/pireps/${encodeURIComponent(pirepId)}`);
  const detail = payloadFromBody(body);
  if (!detail) throw new Error(`vAMSYS no devolvió detalle para PIREP ${pirepId}.`);
  return detail;
}

async function createPayrollAndWalletIfMissing(input: {
  storedPirepId: string;
  pilotId: string;
  vamsysPirepId: string;
  flightNumber: string | null;
}) {
  const existing = await prisma.payrollRecord.findUnique({
    where: { pirepId: input.storedPirepId },
    include: { walletTransaction: true },
  });
  if (existing) {
    if (existing.walletTransaction) return { payrollGenerated: false, walletTransactionCreated: false };
    const wallet = await prisma.walletTransaction.create({
      data: {
        pilotId: input.pilotId,
        payrollRecordId: existing.id,
        type: "payroll",
        amountCents: existing.amountCents,
        description: `Nómina ${input.flightNumber ?? input.vamsysPirepId}`,
        reference: input.vamsysPirepId,
      },
    }).catch((error) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return null;
      throw error;
    });
    if (wallet) await prisma.pilot.update({ where: { id: input.pilotId }, data: { walletBalanceCents: { increment: existing.amountCents } } });
    return { payrollGenerated: false, walletTransactionCreated: Boolean(wallet) };
  }

  const [pirep, rule] = await Promise.all([
    prisma.pirep.findUnique({ where: { id: input.storedPirepId } }),
    prisma.payrollRule.findFirst({ where: { isActive: true }, orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }] }),
  ]);
  if (!pirep || !rule || !pirep.aircraftType || pirep.flightTimeMinutes === null || !pirep.network || pirep.landingRate === null || pirep.score === null || !pirep.flownAt) {
    return { payrollGenerated: false, walletTransactionCreated: false };
  }

  const calc = calculatePayroll({
    aircraftType: pirep.aircraftType,
    flightTimeMinutes: pirep.flightTimeMinutes,
    network: pirep.network,
    landingRate: pirep.landingRate,
    score: pirep.score,
    status: pirep.status,
  }, payrollRulesFromStoredRule(rule));
  const amountCents = creditsToCents(calc.finalAmount);

  try {
    const payroll = await prisma.payrollRecord.create({
      data: {
        pirepId: input.storedPirepId,
        pilotId: input.pilotId,
        payrollRuleId: rule.id,
        basePayCents: creditsToCents(calc.basePay),
        bonusCents: creditsToCents(calc.totalBonus),
        penaltyCents: creditsToCents(calc.penalties),
        amountCents,
        calculationDetails: { ...calc },
        status: "paid",
        approvedAt: new Date(),
        paidAt: new Date(),
        settlementMonth: pirep.flownAt.toISOString().slice(0, 7),
      },
    });
    await prisma.walletTransaction.create({
      data: {
        pilotId: input.pilotId,
        payrollRecordId: payroll.id,
        type: "payroll",
        amountCents,
        description: `Nómina ${input.flightNumber ?? input.vamsysPirepId}`,
        reference: input.vamsysPirepId,
      },
    });
    await prisma.pilot.update({ where: { id: input.pilotId }, data: { walletBalanceCents: { increment: amountCents } } });
    await writeAuditLogSafely({
      action: "PIREP_PIPELINE_PAYROLL_WALLET_CREATED",
      entityType: "Pirep",
      entityId: input.storedPirepId,
      message: `Pipeline created paid payroll and wallet transaction for PIREP ${input.vamsysPirepId}.`,
      metadata: { amountCents, pilotId: input.pilotId },
    });
    return { payrollGenerated: true, walletTransactionCreated: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { payrollGenerated: false, walletTransactionCreated: false };
    }
    throw error;
  }
}

export async function processAcceptedOperationsPirep(pirepSummaryOrId: string | Row): Promise<ProcessAcceptedOperationsPirepResult> {
  const pirepId = extractPirepId(pirepSummaryOrId);
  if (!pirepId) throw new Error("No se pudo determinar el PIREP id para procesar.");

  const detail = await fetchPirepDetail(pirepId);
  const merged = typeof pirepSummaryOrId === "string" ? detail : mergeOperationsPirepRecords(pirepSummaryOrId, detail);
  const mapped = mapOperationsPirep(merged);
  if (!mapped.pilotExternalId) throw new Error(`PIREP ${mapped.data.vamsysPirepId} sin pilot_id.`);

  const pilot = await prisma.pilot.upsert({
    where: { vamsysPilotId: mapped.pilotExternalId },
    update: { lastPirepSyncAt: new Date() },
    create: { vamsysPilotId: mapped.pilotExternalId, displayName: `Piloto ${mapped.pilotExternalId}`, lastPirepSyncAt: new Date() },
  });
  const economics = await calculateFuelCostSnapshot({
    departure: mapped.data.departure,
    fuelUsedKg: mapped.data.fuelUsed,
    at: mapped.data.flownAt ?? mapped.data.vamsysUpdatedAt,
  });
  const pirepData = { ...mapped.data, ...economics };
  const existing = await prisma.pirep.findUnique({ where: { vamsysPirepId: mapped.data.vamsysPirepId }, select: { id: true } });
  const stored = await prisma.pirep.upsert({
    where: { vamsysPirepId: mapped.data.vamsysPirepId },
    update: { ...pirepData, pilotId: pilot.id },
    create: { ...pirepData, pilotId: pilot.id },
  });

  const expenses = await generateCompanyExpensesForPirep(stored.id);
  const payroll = await createPayrollAndWalletIfMissing({
    storedPirepId: stored.id,
    pilotId: pilot.id,
    vamsysPirepId: mapped.data.vamsysPirepId,
    flightNumber: mapped.data.flightNumber,
  });

  await writeAuditLogSafely({
    action: "PIREP_PIPELINE_PROCESSED",
    entityType: "Pirep",
    entityId: stored.id,
    message: `Pipeline processed accepted vAMSYS PIREP ${mapped.data.vamsysPirepId}.`,
    metadata: {
      imported: existing ? false : true,
      updated: existing ? true : false,
      payrollGenerated: payroll.payrollGenerated,
      walletTransactionCreated: payroll.walletTransactionCreated,
      expensesGenerated: expenses.generated,
    },
  });

  return {
    imported: !existing,
    updated: Boolean(existing),
    payrollGenerated: payroll.payrollGenerated,
    walletTransactionCreated: payroll.walletTransactionCreated,
    expensesGenerated: expenses.generated,
    pirepId: stored.id,
    vamsysPirepId: mapped.data.vamsysPirepId,
  };
}

function applyProcessed(result: OperationsPirepSyncResult, processed: ProcessAcceptedOperationsPirepResult) {
  if (processed.imported) result.importedCount++;
  if (processed.updated) result.updatedCount++;
  if (processed.payrollGenerated) result.payrollGeneratedCount++;
  if (processed.walletTransactionCreated) result.walletTransactionsCount++;
  result.expensesGeneratedCount += processed.expensesGenerated;
}

async function fetchAllAccepted() {
  const rows: Row[] = [];
  let nextRequest: string | null = null;
  for (let page = 0; page < 100; page++) {
    const query = new URLSearchParams({ "filter[status]": "accepted", "page[size]": "50", sort: "-created_at" });
    const request = nextRequest ?? `/pireps?${query}`;
    const body = rec(await operationsRequest(request));
    const data = Array.isArray(body?.data) ? body.data.map(rec).filter(Boolean) as Row[] : [];
    const nextUrl = body ? nextVamsysPageUrl(body) : null;
    const cursor = body ? nextVamsysCursor(body) : null;
    nextRequest = nextUrl ?? (cursor ? `/pireps?${new URLSearchParams({ "filter[status]": "accepted", "page[size]": "50", sort: "-created_at", "page[cursor]": cursor })}` : null);
    console.info(`[vAMSYS PIREP sync] page=${page + 1} records=${data.length} next=${nextRequest ?? "none"}`);
    rows.push(...data);
    if (!nextRequest) return rows;
  }
  throw new Error("La paginacion de PIREPs supero el limite de seguridad.");
}

export async function syncAcceptedOperationsPireps(staffUserId?: string): Promise<OperationsPirepSyncResult> {
  const result = emptyResult();
  await writeAuditLogSafely({ staffUserId, action: "VAMSYS_OPERATIONS_PIREP_SYNC_STARTED", entityType: "Pirep", message: "Se inicio la sincronizacion global de PIREPs aceptados mediante Operations API." });
  try {
    const rows = await fetchAllAccepted();
    for (const summary of rows) {
      try {
        applyProcessed(result, await processAcceptedOperationsPirep(summary));
      } catch (error) {
        result.skippedCount++;
        result.errors.push(error instanceof Error ? error.message : "Error desconocido.");
      }
    }
    await updatePirepSyncState(result, false);
    await writeAuditLogSafely({ staffUserId, action: "VAMSYS_OPERATIONS_PIREP_SYNC_COMPLETED", entityType: "Pirep", message: `Operations API: ${result.importedCount} PIREPs nuevos, ${result.updatedCount} actualizados, ${result.payrollGeneratedCount} nominas y ${result.expensesGeneratedCount} gastos.`, metadata: syncMetadata(result) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido.";
    result.errors.push(message);
    await writeAuditLogSafely({ staffUserId, action: "VAMSYS_OPERATIONS_PIREP_SYNC_FAILED", entityType: "Pirep", message: `Fallo la sincronizacion global de PIREPs: ${message}` });
  }
  return result;
}

async function fetchIncrementalAccepted(limit = 50, since?: Date) {
  const query = new URLSearchParams({ "filter[status]": "accepted", "page[size]": String(Math.min(limit, 50)), sort: "-updated_at" });
  if (since) query.set("filter[updated_at][gte]", since.toISOString());
  let body: Row | null;
  try {
    body = rec(await operationsRequest(`/pireps?${query}`));
  } catch (error) {
    if (!since) throw error;
    console.warn("[vAMSYS PIREP cron] updated_at filter failed; retrying latest accepted PIREPs without date filter.");
    query.delete("filter[updated_at][gte]");
    body = rec(await operationsRequest(`/pireps?${query}`));
  }
  const data = Array.isArray(body?.data) ? body.data.map(rec).filter(Boolean) as Row[] : [];
  const next = body ? nextVamsysPageUrl(body) ?? nextVamsysCursor(body) : null;
  console.info(`[vAMSYS PIREP cron] records=${data.length} next=${next ?? "none"}`);
  return data.slice(0, Math.min(limit, 50));
}

function syncMetadata(result: OperationsPirepSyncResult) {
  return {
    imported: result.importedCount,
    updated: result.updatedCount,
    skipped: result.skippedCount,
    payrollGenerated: result.payrollGeneratedCount,
    expensesGenerated: result.expensesGeneratedCount,
    walletTransactions: result.walletTransactionsCount,
    errors: result.errors.length,
  };
}

async function updatePirepSyncState(result: OperationsPirepSyncResult, cron: boolean) {
  const now = new Date();
  await prisma.operationsApiState.upsert({
    where: { id: "vamsys" },
    update: {
      status: result.errors.length ? "degraded" : "healthy",
      lastPirepSyncAt: now,
      lastCronPirepSyncAt: cron ? now : undefined,
      lastError: result.errors[0]?.slice(0, 180) ?? null,
    },
    create: {
      id: "vamsys",
      status: result.errors.length ? "degraded" : "healthy",
      lastPirepSyncAt: now,
      lastCronPirepSyncAt: cron ? now : null,
      lastError: result.errors[0]?.slice(0, 180),
    },
  });
}

export async function syncAcceptedOperationsPirepsIncremental(options: { limit?: number; cron?: boolean } = {}): Promise<OperationsPirepSyncResult> {
  const limit = Math.max(1, Math.min(options.limit ?? 50, 50));
  const result = emptyResult();
  const state = await prisma.operationsApiState.findUnique({ where: { id: "vamsys" } }).catch(() => null);
  const since = state?.lastCronPirepSyncAt ?? state?.lastPirepSyncAt ?? undefined;
  await writeAuditLogSafely({ action: "VAMSYS_OPERATIONS_PIREP_CRON_STARTED", entityType: "Pirep", message: "Started incremental accepted PIREP sync through vAMSYS Operations API." });

  try {
    const rows = await fetchIncrementalAccepted(limit, since);
    for (const summary of rows) {
      try {
        applyProcessed(result, await processAcceptedOperationsPirep(summary));
      } catch (error) {
        result.skippedCount++;
        result.errors.push(error instanceof Error ? error.message : "Error desconocido.");
      }
    }
    await updatePirepSyncState(result, Boolean(options.cron));
    console.info(`[vAMSYS PIREP cron] completed imported=${result.importedCount} updated=${result.updatedCount} skipped=${result.skippedCount} payrollGenerated=${result.payrollGeneratedCount} expensesGenerated=${result.expensesGeneratedCount} walletTransactions=${result.walletTransactionsCount} errors=${result.errors.length}`);
    await writeAuditLogSafely({ action: "VAMSYS_OPERATIONS_PIREP_CRON_COMPLETED", entityType: "Pirep", message: `Cron Operations PIREPs: ${result.importedCount} nuevos, ${result.updatedCount} actualizados, ${result.skippedCount} omitidos, ${result.payrollGeneratedCount} nominas y ${result.expensesGeneratedCount} gastos.`, metadata: syncMetadata(result) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido.";
    result.errors.push(message);
    await prisma.operationsApiState.upsert({
      where: { id: "vamsys" },
      update: { status: "error", lastCronPirepSyncAt: options.cron ? new Date() : state?.lastCronPirepSyncAt, lastError: message.slice(0, 180) },
      create: { id: "vamsys", status: "error", lastCronPirepSyncAt: options.cron ? new Date() : null, lastError: message.slice(0, 180) },
    });
    await writeAuditLogSafely({ action: "VAMSYS_OPERATIONS_PIREP_CRON_FAILED", entityType: "Pirep", message: `Fallo el cron incremental de PIREPs: ${message}`, metadata: syncMetadata(result) });
  }
  return result;
}
