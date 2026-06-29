import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLogSafely } from "@/lib/audit/log";
import { calculatePayroll, creditsToCents } from "@/lib/payroll/calculatePayroll";
import { payrollRulesFromStoredRule } from "@/lib/payroll/rules";
import { calculatePassengerRevenue } from "@/lib/revenue/passengerRevenue";
import { operationsRequest } from "./operations";

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
  const status = (str(raw, "status") ?? "").toLowerCase(); if (status !== "accepted") throw new Error(`PIREP ${id} no aceptado.`);
  const booking = nested(raw, "booking"), fleet = nested(raw, "fleet") ?? (booking ? nested(booking, "fleet") : null), aircraft = nested(raw, "aircraft") ?? (booking ? nested(booking, "aircraft") : null);
  const departure = nested(raw, "departure_airport") ?? (booking ? nested(booking, "departure") : null);
  const arrival = nested(raw, "arrival_airport") ?? (booking ? nested(booking, "arrival") : null);
  const passengersValue = num(raw, "passengers") ?? (booking ? num(booking, "passengers") : null);
  const distanceValue = num(raw, "flight_distance");
  const passengers = passengersValue === null ? null : Math.round(passengersValue);
  const flightDistanceNm = distanceValue === null ? null : Math.round(distanceValue);
  const passengerRevenueCents = passengers !== null && flightDistanceNm !== null ? calculatePassengerRevenue(passengers, flightDistanceNm).revenueCents : null;
  return {
    pilotExternalId: str(raw, "pilot_id", "pilotId"),
    data: {
      vamsysPirepId: id, flightNumber: str(raw, "flight_number"), callsign: str(raw, "callsign"),
      departure: departure ? str(departure, "icao", "ident", "code", "id") : str(raw, "departure_airport_id"),
      arrival: arrival ? str(arrival, "icao", "ident", "code", "id") : str(raw, "arrival_airport_id"),
      aircraftType: fleet ? str(fleet, "code", "icao", "name") : aircraft ? str(aircraft, "type", "icao") : null,
      network: str(raw, "network"), flightTimeMinutes: minutes(num(raw, "flight_length")), blockTimeMinutes: minutes(num(raw, "block_length")),
      landingRate: num(raw, "landing_rate") === null ? null : Math.round(num(raw, "landing_rate")!), score: num(raw, "points") === null ? null : Math.round(num(raw, "points")!),
      fuelUsed: num(raw, "fuel_used") === null ? null : Math.round(num(raw, "fuel_used")!), points: num(raw, "points"), credits: num(raw, "bonus_sum"),
      passengers, flightDistanceNm, passengerRevenueCents,
      status: "accepted" as const, acarsSoftware: str(raw, "acars_version"), source: "vamsys_operations",
      flownAt: date(raw, "landing_time", "on_blocks_time", "created_at"), acceptedAt: date(raw, "updated_at"), vamsysCreatedAt: date(raw, "created_at"), vamsysUpdatedAt: date(raw, "updated_at"), rawData: raw as Prisma.InputJsonValue, synchronizedAt: new Date(),
    },
  };
}

async function fetchAllAccepted() {
  const rows: Row[] = []; let cursor: string | null = null;
  for (let page = 0; page < 100; page++) {
    const query = new URLSearchParams({ "filter[status]": "accepted", "page[size]": "50", sort: "-created_at" }); if (cursor) query.set("page[cursor]", cursor);
    const body = rec(await operationsRequest(`/pireps?${query}`)); const data = Array.isArray(body?.data) ? body.data.map(rec).filter(Boolean) as Row[] : [];
    rows.push(...data); const meta = rec(body?.meta); cursor = meta ? str(meta, "next_cursor") : null; if (!cursor) return rows;
  }
  throw new Error("La paginación de PIREPs superó el límite de seguridad.");
}

export async function syncAcceptedOperationsPireps(staffUserId?: string): Promise<OperationsPirepSyncResult> {
  const result: OperationsPirepSyncResult = { importedCount: 0, updatedCount: 0, skippedCount: 0, payrollGeneratedCount: 0, errors: [] };
  await writeAuditLogSafely({ staffUserId, action: "VAMSYS_OPERATIONS_PIREP_SYNC_STARTED", entityType: "Pirep", message: "Se inició la sincronización global de PIREPs aceptados mediante Operations API." });
  try {
    const [rows, rule] = await Promise.all([fetchAllAccepted(), prisma.payrollRule.findFirst({ where: { isActive: true }, orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }] })]);
    for (const summary of rows) try {
      const summaryMapped = mapOperationsPirep(summary); const detailBody = rec(await operationsRequest(`/pireps/${encodeURIComponent(summaryMapped.data.vamsysPirepId)}`)); const detail = rec(detailBody?.data) ?? summary; const mapped = mapOperationsPirep(detail);
      if (!mapped.pilotExternalId) throw new Error(`PIREP ${mapped.data.vamsysPirepId} sin pilot_id.`);
      const pilot = await prisma.pilot.upsert({ where: { vamsysPilotId: mapped.pilotExternalId }, update: {}, create: { vamsysPilotId: mapped.pilotExternalId, displayName: `Piloto ${mapped.pilotExternalId}` } });
      const existing = await prisma.pirep.findUnique({ where: { vamsysPirepId: mapped.data.vamsysPirepId }, select: { id: true } });
      const stored = await prisma.pirep.upsert({ where: { vamsysPirepId: mapped.data.vamsysPirepId }, update: { ...mapped.data, pilotId: pilot.id }, create: { ...mapped.data, pilotId: pilot.id }, include: { payrollRecord: true } });
      if (existing) result.updatedCount++; else result.importedCount++;
      const d = mapped.data;
      if (!stored.payrollRecord && rule && d.aircraftType && d.flightTimeMinutes !== null && d.network && d.landingRate !== null && d.score !== null && d.flownAt) {
        const calc = calculatePayroll({ aircraftType: d.aircraftType, flightTimeMinutes: d.flightTimeMinutes, network: d.network, landingRate: d.landingRate, score: d.score, status: d.status }, payrollRulesFromStoredRule(rule));
        try { await prisma.payrollRecord.create({ data: { pirepId: stored.id, pilotId: pilot.id, payrollRuleId: rule.id, basePayCents: creditsToCents(calc.basePay), bonusCents: creditsToCents(calc.totalBonus), penaltyCents: creditsToCents(calc.penalties), amountCents: creditsToCents(calc.finalAmount), calculationDetails: { ...calc }, settlementMonth: d.flownAt.toISOString().slice(0, 7) } }); result.payrollGeneratedCount++; } catch (error) { if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error; }
      }
    } catch (error) { result.skippedCount++; result.errors.push(error instanceof Error ? error.message : "Error desconocido."); }
    await writeAuditLogSafely({ staffUserId, action: "VAMSYS_OPERATIONS_PIREP_SYNC_COMPLETED", entityType: "Pirep", message: `Operations API: ${result.importedCount} PIREPs nuevos, ${result.updatedCount} actualizados y ${result.payrollGeneratedCount} nóminas.`, metadata: { imported: result.importedCount, updated: result.updatedCount, skipped: result.skippedCount, payroll: result.payrollGeneratedCount } });
  } catch (error) { const message = error instanceof Error ? error.message : "Error desconocido."; result.errors.push(message); await writeAuditLogSafely({ staffUserId, action: "VAMSYS_OPERATIONS_PIREP_SYNC_FAILED", entityType: "Pirep", message: `Falló la sincronización global de PIREPs: ${message}` }); }
  return result;
}
