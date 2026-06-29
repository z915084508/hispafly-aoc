import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLogSafely } from "@/lib/audit/log";
import { calculatePayroll, creditsToCents } from "@/lib/payroll/calculatePayroll";
import { payrollRulesFromStoredRule } from "@/lib/payroll/rules";
import { operationsRequest } from "./operations";
import { nextVamsysCursor, nextVamsysPageUrl } from "./pagination";
import { isCompletedOperationsPirep, mergeOperationsPirepRecords, operationsPirepStatus } from "./operationsPirepPayload";

type Row = Record<string, unknown>;

export interface OperationsPirepSyncResult {
  importedCount: number;
  updatedCount: number;
  skippedCount: number;
  payrollGeneratedCount: number;
  errors: string[];
}

const record = (value: unknown): Row | null => value && typeof value === "object" && !Array.isArray(value) ? value as Row : null;
const str = (row: Row, ...keys: string[]) => {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" || typeof value === "number") return String(value);
  }
  return null;
};
const num = (row: Row, ...keys: string[]) => {
  const value = str(row, ...keys);
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const date = (row: Row, ...keys: string[]) => {
  const value = str(row, ...keys);
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const nested = (row: Row, key: string) => record(row[key]);
const minutes = (seconds: number | null) => seconds === null ? null : Math.round(seconds / 60);

function requiredText(label: string, value: string | null) {
  if (!value) throw new Error(`PIREP missing required ${label}.`);
  return value;
}

function requiredNumber(label: string, value: number | null) {
  if (value === null) throw new Error(`PIREP missing required ${label}.`);
  return Math.round(value);
}

function requiredDate(label: string, value: Date | null) {
  if (!value) throw new Error(`PIREP missing required ${label}.`);
  return value;
}

export function mapOperationsPirep(raw: Row) {
  const id = str(raw, "id", "pirep_id", "pirepId");
  if (!id) throw new Error("Operations PIREP has no identifier.");
  const attributes = record(raw.attributes) ?? {};
  const source = { ...attributes, ...raw };
  const status = operationsPirepStatus(raw);
  if (!isCompletedOperationsPirep(raw)) throw new Error(`PIREP ${id} skipped because status is ${status ?? "unknown"}.`);

  const booking = nested(source, "booking");
  const fleet = nested(source, "fleet") ?? (booking ? nested(booking, "fleet") : null);
  const aircraft = nested(source, "aircraft") ?? (booking ? nested(booking, "aircraft") : null);
  const departure = nested(source, "departure_airport") ?? (booking ? nested(booking, "departure") : null);
  const arrival = nested(source, "arrival_airport") ?? (booking ? nested(booking, "arrival") : null);
  const flightTimeMinutes = minutes(num(source, "flight_length", "flightLength", "flight_time_seconds"));
  const blockTimeMinutes = minutes(num(source, "block_length", "blockLength", "block_time_seconds")) ?? flightTimeMinutes;

  return {
    pilotExternalId: str(source, "pilot_id", "pilotId", "pilot_uuid", "pilotUuid"),
    data: {
      vamsysPirepId: id,
      flightNumber: requiredText("flight number", str(source, "flight_number", "flightNumber", "route_number")),
      callsign: requiredText("callsign", str(source, "callsign", "aircraft_callsign")),
      departure: requiredText("departure", departure ? str(departure, "icao", "ident", "code", "id") : str(source, "departure_airport_id", "departure")),
      arrival: requiredText("arrival", arrival ? str(arrival, "icao", "ident", "code", "id") : str(source, "arrival_airport_id", "arrival")),
      aircraftType: requiredText("aircraft type", fleet ? str(fleet, "code", "icao", "name") : aircraft ? str(aircraft, "type", "icao") : str(source, "aircraft_type", "aircraftType")),
      network: requiredText("network", str(source, "network") ?? "OFFLINE"),
      flightTimeMinutes: requiredNumber("flight time", flightTimeMinutes),
      blockTimeMinutes: requiredNumber("block time", blockTimeMinutes),
      landingRate: requiredNumber("landing rate", num(source, "landing_rate", "landingRate")),
      score: requiredNumber("score", num(source, "score", "points")),
      fuelUsed: requiredNumber("fuel used", num(source, "fuel_used", "fuelUsed")),
      status: "accepted" as const,
      flownAt: requiredDate("flight date", date(source, "landing_time", "on_blocks_time", "created_at", "flown_at")),
      acceptedAt: date(source, "accepted_at", "approved_at", "updated_at"),
      sourcePayload: raw as Prisma.InputJsonValue,
      synchronizedAt: new Date(),
    },
  };
}

async function fetchAllAcceptedOperationsPireps() {
  const rows: Row[] = [];
  let nextRequest: string | null = null;

  for (let page = 0; page < 100; page++) {
    const query = new URLSearchParams({ "filter[status]": "accepted", "page[size]": "50", sort: "-created_at" });
    const request = nextRequest ?? `/pireps?${query}`;
    const body = record(await operationsRequest(request));
    const data = Array.isArray(body?.data) ? body.data.map(record).filter(Boolean) as Row[] : [];
    const nextUrl = body ? nextVamsysPageUrl(body) : null;
    const cursor = body ? nextVamsysCursor(body) : null;
    nextRequest = nextUrl ?? (cursor ? `/pireps?${new URLSearchParams({ "filter[status]": "accepted", "page[size]": "50", sort: "-created_at", "page[cursor]": cursor })}` : null);

    console.info(`[vAMSYS PIREP sync] page=${page + 1} records=${data.length} next=${nextRequest ?? "none"}`);
    rows.push(...data);
    if (!nextRequest) return rows;
  }

  throw new Error("vAMSYS Operations PIREP pagination exceeded the 100 page safety limit.");
}

export async function syncAcceptedOperationsPireps(staffUserId?: string): Promise<OperationsPirepSyncResult> {
  const result: OperationsPirepSyncResult = { importedCount: 0, updatedCount: 0, skippedCount: 0, payrollGeneratedCount: 0, errors: [] };
  await writeAuditLogSafely({ staffUserId, action: "VAMSYS_OPERATIONS_PIREP_SYNC_STARTED", entityType: "Pirep", message: "Started global accepted PIREP sync through vAMSYS Operations API." });

  try {
    const [rows, rule] = await Promise.all([
      fetchAllAcceptedOperationsPireps(),
      prisma.payrollRule.findFirst({ where: { isActive: true }, orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }] }),
    ]);

    for (const summary of rows) {
      try {
        const summaryMapped = mapOperationsPirep(summary);
        const detailBody = record(await operationsRequest(`/pireps/${encodeURIComponent(summaryMapped.data.vamsysPirepId)}`));
        const detail = record(detailBody?.data) ?? summary;
        const mapped = mapOperationsPirep(mergeOperationsPirepRecords(summary, detail));
        if (!mapped.pilotExternalId) throw new Error(`PIREP ${mapped.data.vamsysPirepId} has no pilot_id.`);

        const pilot = await prisma.pilot.upsert({
          where: { vamsysPilotId: mapped.pilotExternalId },
          update: {},
          create: { vamsysPilotId: mapped.pilotExternalId, displayName: `Pilot ${mapped.pilotExternalId}` },
        });
        const existing = await prisma.pirep.findUnique({ where: { vamsysPirepId: mapped.data.vamsysPirepId }, select: { id: true } });
        const stored = await prisma.pirep.upsert({
          where: { vamsysPirepId: mapped.data.vamsysPirepId },
          update: { ...mapped.data, pilotId: pilot.id },
          create: { ...mapped.data, pilotId: pilot.id },
          include: { payrollRecord: true },
        });
        if (existing) result.updatedCount++; else result.importedCount++;

        if (!stored.payrollRecord && rule) {
          const calc = calculatePayroll(mapped.data, payrollRulesFromStoredRule(rule));
          try {
            await prisma.payrollRecord.create({
              data: {
                pirepId: stored.id,
                pilotId: pilot.id,
                payrollRuleId: rule.id,
                basePayCents: creditsToCents(calc.basePay),
                bonusCents: creditsToCents(calc.totalBonus),
                penaltyCents: creditsToCents(calc.penalties),
                amountCents: creditsToCents(calc.finalAmount),
                calculationDetails: { ...calc },
                settlementMonth: mapped.data.flownAt.toISOString().slice(0, 7),
              },
            });
            result.payrollGeneratedCount++;
          } catch (error) {
            if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
          }
        }
      } catch (error) {
        result.skippedCount++;
        const message = error instanceof Error ? error.message : "Unknown error.";
        result.errors.push(message);
      }
    }

    console.info(`[vAMSYS PIREP sync] completed fetched=${rows.length} imported=${result.importedCount} updated=${result.updatedCount} skipped=${result.skippedCount} payroll=${result.payrollGeneratedCount}`);
    await writeAuditLogSafely({ staffUserId, action: "VAMSYS_OPERATIONS_PIREP_SYNC_COMPLETED", entityType: "Pirep", message: `Operations API: ${result.importedCount} new PIREPs, ${result.updatedCount} updated, ${result.skippedCount} skipped and ${result.payrollGeneratedCount} payroll records.`, metadata: { imported: result.importedCount, updated: result.updatedCount, skipped: result.skippedCount, payroll: result.payrollGeneratedCount } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    result.errors.push(message);
    await writeAuditLogSafely({ staffUserId, action: "VAMSYS_OPERATIONS_PIREP_SYNC_FAILED", entityType: "Pirep", message: `Global PIREP sync failed: ${message}` });
  }

  return result;
}
