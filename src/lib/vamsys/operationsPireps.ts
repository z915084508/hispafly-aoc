import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLogSafely } from "@/lib/audit/log";
import { calculatePayroll, creditsToCents } from "@/lib/payroll/calculatePayroll";
import { payrollRulesFromStoredRule } from "@/lib/payroll/rules";
import { calculateFuelCostSnapshot } from "@/lib/economy/fuel";
import { calculatePassengerRevenue } from "@/lib/revenue/passengerRevenue";
import { operationsRequest } from "./operations";
import { nextVamsysCursor, nextVamsysPageUrl } from "./pagination";
import { isCompletedOperationsPirep, mergeOperationsPirepRecords, operationsPirepStatus } from "./operationsPirepPayload";

type Row = Record<string, unknown>;
export interface OperationsPirepSyncResult { importedCount: number; updatedCount: number; skippedCount: number; payrollGeneratedCount: number; errors: string[] }
const rec = (v: unknown): Row | null => v && typeof v === "object" && !Array.isArray(v) ? v as Row : null;
const str = (r: Row, ...keys: string[]) => { for (const k of keys) if (typeof r[k] === "string" || typeof r[k] === "number") return String(r[k]); return null; };
const num = (r: Row, ...keys: string[]) => { const value = str(r, ...keys); if (value === null) return null; const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; };
const date = (r: Row, ...keys: string[]) => { const value = str(r, ...keys); if (!value) return null; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? null : parsed; };
const nested = (r: Row, key: string) => rec(r[key]);
const minutes = (seconds: number | null) => seconds === null ? null : Math.round(seconds / 60);

export function mapOperationsPirep(raw: Row) {
  const id = str(raw, "id", "pirep_id"); if (!id) throw new Error("PIREP Operations sin identificador.");
  const attributes = rec(raw.attributes) ?? {};
  const source = { ...attributes, ...raw };
  const status = operationsPirepStatus(raw);
  if (!isCompletedOperationsPirep(raw)) throw new Error(`PIREP ${id} omitido por estado ${status ?? "desconocido"}.`);
  const booking = nested(source, "booking"), fleet = nested(source, "fleet") ?? (booking ? nested(booking, "fleet") : null), aircraft = nested(source, "aircraft") ?? (booking ? nested(booking, "aircraft") : null);
  const departure = nested(source, "departure_airport") ?? (booking ? nested(booking, "departure") : null);
  const arrival = nested(source, "arrival_airport") ?? (booking ? nested(booking, "arrival") : null);
  const passengersValue = num(source, "passengers") ?? (booking ? num(booking, "passengers") : null);
  const distanceValue = num(source, "flight_distance");
  const passengers = passengersValue === null ? null : Math.round(passengersValue);
  const flightDistanceNm = distanceValue === null ? null : Math.round(distanceValue);
  const passengerRevenueCents = passengers !== null && flightDistanceNm !== null ? calculatePassengerRevenue(passengers, flightDistanceNm).revenueCents : null;
  const cargoValue = num(source, "cargo", "cargo_kg", "cargoKg", "cargo_weight", "cargoWeight", "freight", "freight_kg", "freight_weight", "freightWeight", "payload", "payload_kg")
    ?? (booking ? num(booking, "cargo", "cargo_kg", "cargoKg", "cargo_weight", "cargoWeight", "freight", "freight_kg", "freight_weight", "freightWeight", "payload", "payload_kg") : null);
  const fuelUsed = num(source, "fuel_used") === null ? null : Math.round(num(source, "fuel_used")!);
  const cargoKg = cargoValue === null ? null : Math.round(cargoValue);
  return {
    pilotExternalId: str(source, "pilot_id", "pilotId"),
    data: {
      vamsysPirepId: id, flightNumber: str(source, "flight_number"), callsign: str(source, "callsign"),
      departure: departure ? str(departure, "icao", "ident", "code", "id") : str(source, "departure_airport_id"),
      arrival: arrival ? str(arrival, "icao", "ident", "code", "id") : str(source, "arrival_airport_id"),
      aircraftType: fleet ? str(fleet, "code", "icao", "name") : aircraft ? str(aircraft, "type", "icao") : null,
      network: str(source, "network"), flightTimeMinutes: minutes(num(source, "flight_length")), blockTimeMinutes: minutes(num(source, "block_length")),
      landingRate: num(source, "landing_rate") === null ? null : Math.round(num(source, "landing_rate")!), score: num(source, "points") === null ? null : Math.round(num(source, "points")!),
      fuelUsed, points: num(source, "points"), credits: num(source, "bonus_sum"),
      passengers, cargoKg, flightDistanceNm, passengerRevenueCents,
      status: "accepted" as const, acarsSoftware: str(source, "acars_version"), source: "vamsys_operations",
      flownAt: date(source, "landing_time", "on_blocks_time", "created_at"), acceptedAt: date(source, "updated_at"), vamsysCreatedAt: date(source, "created_at"), vamsysUpdatedAt: date(source, "updated_at"), rawData: raw as Prisma.InputJsonValue, synchronizedAt: new Date(),
    },
  };
}

async function withFuelEconomics<T extends { departure: string | null; fuelUsed: number | null; flownAt: Date | null; vamsysUpdatedAt: Date | null }>(data: T) {
  const economics = await calculateFuelCostSnapshot({ departure: data.departure, fuelUsedKg: data.fuelUsed, at: data.flownAt ?? data.vamsysUpdatedAt });
  return { ...data, ...economics };
}

async function fetchAllAccepted() {
  const rows: Row[] = []; let nextRequest: string | null = null;
  for (let page = 0; page < 100; page++) {
    const query = new URLSearchParams({ "filter[status]": "accepted", "page[size]": "50", sort: "-created_at" });
    const request = nextRequest ?? `/pireps?${query}`;
    const body = rec(await operationsRequest(request)); const data = Array.isArray(body?.data) ? body.data.map(rec).filter(Boolean) as Row[] : [];
    const nextUrl = body ? nextVamsysPageUrl(body) : null;
    const cursor = body ? nextVamsysCursor(body) : null;
    nextRequest = nextUrl ?? (cursor ? `/pireps?${new URLSearchParams({ "filter[status]": "accepted", "page[size]": "50", sort: "-created_at", "page[cursor]": cursor })}` : null);
    console.info(`[vAMSYS PIREP sync] page=${page + 1} records=${data.length} next=${nextRequest ?? "none"}`);
    rows.push(...data); if (!nextRequest) return rows;
  }
  throw new Error("La paginación de PIREPs superó el límite de seguridad.");
}

export async function syncAcceptedOperationsPireps(staffUserId?: string): Promise<OperationsPirepSyncResult> {
  const result: OperationsPirepSyncResult = { importedCount: 0, updatedCount: 0, skippedCount: 0, payrollGeneratedCount: 0, errors: [] };
  await writeAuditLogSafely({ staffUserId, action: "VAMSYS_OPERATIONS_PIREP_SYNC_STARTED", entityType: "Pirep", message: "Se inició la sincronización global de PIREPs aceptados mediante Operations API." });
  try {
    const [rows, rule] = await Promise.all([fetchAllAccepted(), prisma.payrollRule.findFirst({ where: { isActive: true }, orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }] })]);
    for (const summary of rows) try {
      const summaryMapped = mapOperationsPirep(summary); const detailBody = rec(await operationsRequest(`/pireps/${encodeURIComponent(summaryMapped.data.vamsysPirepId)}`)); const detail = rec(detailBody?.data) ?? summary; const mapped = mapOperationsPirep(mergeOperationsPirepRecords(summary, detail));
      if (!mapped.pilotExternalId) throw new Error(`PIREP ${mapped.data.vamsysPirepId} sin pilot_id.`);
      const pilot = await prisma.pilot.upsert({ where: { vamsysPilotId: mapped.pilotExternalId }, update: {}, create: { vamsysPilotId: mapped.pilotExternalId, displayName: `Piloto ${mapped.pilotExternalId}` } });
      const pirepData = await withFuelEconomics(mapped.data);
      const existing = await prisma.pirep.findUnique({ where: { vamsysPirepId: mapped.data.vamsysPirepId }, select: { id: true } });
      const stored = await prisma.pirep.upsert({ where: { vamsysPirepId: mapped.data.vamsysPirepId }, update: { ...pirepData, pilotId: pilot.id }, create: { ...pirepData, pilotId: pilot.id }, include: { payrollRecord: true } });
      if (existing) result.updatedCount++; else result.importedCount++;
      const d = pirepData;
      if (!stored.payrollRecord && rule && d.aircraftType && d.flightTimeMinutes !== null && d.network && d.landingRate !== null && d.score !== null && d.flownAt) {
        const calc = calculatePayroll({ aircraftType: d.aircraftType, flightTimeMinutes: d.flightTimeMinutes, network: d.network, landingRate: d.landingRate, score: d.score, status: d.status }, payrollRulesFromStoredRule(rule));
        try { await prisma.payrollRecord.create({ data: { pirepId: stored.id, pilotId: pilot.id, payrollRuleId: rule.id, basePayCents: creditsToCents(calc.basePay), bonusCents: creditsToCents(calc.totalBonus), penaltyCents: creditsToCents(calc.penalties), amountCents: creditsToCents(calc.finalAmount), calculationDetails: { ...calc }, settlementMonth: d.flownAt.toISOString().slice(0, 7) } }); result.payrollGeneratedCount++; } catch (error) { if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error; }
      }
    } catch (error) { result.skippedCount++; result.errors.push(error instanceof Error ? error.message : "Error desconocido."); }
    console.info(`[vAMSYS PIREP sync] completed fetched=${rows.length} imported=${result.importedCount} updated=${result.updatedCount} skipped=${result.skippedCount}`);
    await prisma.operationsApiState.upsert({
      where: { id: "vamsys" },
      update: { status: result.errors.length ? "degraded" : "healthy", lastPirepSyncAt: new Date(), lastError: result.errors[0]?.slice(0, 180) ?? null },
      create: { id: "vamsys", status: result.errors.length ? "degraded" : "healthy", lastPirepSyncAt: new Date(), lastError: result.errors[0]?.slice(0, 180) },
    });
    await writeAuditLogSafely({ staffUserId, action: "VAMSYS_OPERATIONS_PIREP_SYNC_COMPLETED", entityType: "Pirep", message: `Operations API: ${result.importedCount} PIREPs nuevos, ${result.updatedCount} actualizados y ${result.payrollGeneratedCount} nóminas.`, metadata: { imported: result.importedCount, updated: result.updatedCount, skipped: result.skippedCount, payroll: result.payrollGeneratedCount } });
  } catch (error) { const message = error instanceof Error ? error.message : "Error desconocido."; result.errors.push(message); await writeAuditLogSafely({ staffUserId, action: "VAMSYS_OPERATIONS_PIREP_SYNC_FAILED", entityType: "Pirep", message: `Falló la sincronización global de PIREPs: ${message}` }); }
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

export async function syncAcceptedOperationsPirepsIncremental(options: { limit?: number; cron?: boolean } = {}): Promise<OperationsPirepSyncResult> {
  const limit = Math.max(1, Math.min(options.limit ?? 50, 50));
  const result: OperationsPirepSyncResult = { importedCount: 0, updatedCount: 0, skippedCount: 0, payrollGeneratedCount: 0, errors: [] };
  const state = await prisma.operationsApiState.findUnique({ where: { id: "vamsys" } }).catch(() => null);
  const since = state?.lastCronPirepSyncAt ?? state?.lastPirepSyncAt ?? undefined;
  const now = new Date();
  await writeAuditLogSafely({ action: "VAMSYS_OPERATIONS_PIREP_CRON_STARTED", entityType: "Pirep", message: "Started incremental accepted PIREP sync through vAMSYS Operations API." });

  try {
    const [rows, rule] = await Promise.all([
      fetchIncrementalAccepted(limit, since),
      prisma.payrollRule.findFirst({ where: { isActive: true }, orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }] }),
    ]);
    for (const summary of rows) try {
      const summaryMapped = mapOperationsPirep(summary);
      const detailBody = rec(await operationsRequest(`/pireps/${encodeURIComponent(summaryMapped.data.vamsysPirepId)}`));
      const detail = rec(detailBody?.data) ?? summary;
      const mapped = mapOperationsPirep(mergeOperationsPirepRecords(summary, detail));
      if (!mapped.pilotExternalId) throw new Error(`PIREP ${mapped.data.vamsysPirepId} sin pilot_id.`);
      const pilot = await prisma.pilot.upsert({ where: { vamsysPilotId: mapped.pilotExternalId }, update: {}, create: { vamsysPilotId: mapped.pilotExternalId, displayName: `Piloto ${mapped.pilotExternalId}` } });
      const pirepData = await withFuelEconomics(mapped.data);
      const existing = await prisma.pirep.findUnique({ where: { vamsysPirepId: mapped.data.vamsysPirepId }, select: { id: true } });
      const stored = await prisma.pirep.upsert({ where: { vamsysPirepId: mapped.data.vamsysPirepId }, update: { ...pirepData, pilotId: pilot.id }, create: { ...pirepData, pilotId: pilot.id }, include: { payrollRecord: true } });
      if (existing) result.updatedCount++; else result.importedCount++;
      const d = pirepData;
      if (!stored.payrollRecord && rule && d.aircraftType && d.flightTimeMinutes !== null && d.network && d.landingRate !== null && d.score !== null && d.flownAt) {
        const calc = calculatePayroll({ aircraftType: d.aircraftType, flightTimeMinutes: d.flightTimeMinutes, network: d.network, landingRate: d.landingRate, score: d.score, status: d.status }, payrollRulesFromStoredRule(rule));
        try {
          await prisma.payrollRecord.create({ data: { pirepId: stored.id, pilotId: pilot.id, payrollRuleId: rule.id, basePayCents: creditsToCents(calc.basePay), bonusCents: creditsToCents(calc.totalBonus), penaltyCents: creditsToCents(calc.penalties), amountCents: creditsToCents(calc.finalAmount), calculationDetails: { ...calc }, settlementMonth: d.flownAt.toISOString().slice(0, 7) } });
          result.payrollGeneratedCount++;
        } catch (error) {
          if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
        }
      }
    } catch (error) {
      result.skippedCount++;
      result.errors.push(error instanceof Error ? error.message : "Error desconocido.");
    }

    await prisma.operationsApiState.upsert({
      where: { id: "vamsys" },
      update: { status: result.errors.length ? "degraded" : "healthy", lastPirepSyncAt: now, lastCronPirepSyncAt: options.cron ? now : state?.lastCronPirepSyncAt, lastError: result.errors[0]?.slice(0, 180) ?? null },
      create: { id: "vamsys", status: result.errors.length ? "degraded" : "healthy", lastPirepSyncAt: now, lastCronPirepSyncAt: options.cron ? now : null, lastError: result.errors[0]?.slice(0, 180) },
    });
    console.info(`[vAMSYS PIREP cron] completed imported=${result.importedCount} updated=${result.updatedCount} skipped=${result.skippedCount} payrollGenerated=${result.payrollGeneratedCount} errors=${result.errors.length}`);
    await writeAuditLogSafely({ action: "VAMSYS_OPERATIONS_PIREP_CRON_COMPLETED", entityType: "Pirep", message: `Cron Operations PIREPs: ${result.importedCount} nuevos, ${result.updatedCount} actualizados, ${result.skippedCount} omitidos y ${result.payrollGeneratedCount} nóminas.`, metadata: { imported: result.importedCount, updated: result.updatedCount, skipped: result.skippedCount, payrollGenerated: result.payrollGeneratedCount, errors: result.errors.length } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido.";
    result.errors.push(message);
    await prisma.operationsApiState.upsert({ where: { id: "vamsys" }, update: { status: "error", lastCronPirepSyncAt: options.cron ? now : state?.lastCronPirepSyncAt, lastError: message.slice(0, 180) }, create: { id: "vamsys", status: "error", lastCronPirepSyncAt: options.cron ? now : null, lastError: message.slice(0, 180) } });
    await writeAuditLogSafely({ action: "VAMSYS_OPERATIONS_PIREP_CRON_FAILED", entityType: "Pirep", message: `Falló el cron incremental de PIREPs: ${message}`, metadata: { imported: result.importedCount, updated: result.updatedCount, skipped: result.skippedCount, payrollGenerated: result.payrollGeneratedCount, errors: result.errors.length } });
  }
  return result;
}
