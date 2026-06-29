import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLogSafely } from "@/lib/audit/log";
import { operationsRequest } from "./operations";

const rec = (v: unknown): Record<string, unknown> | null => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
const str = (r: Record<string, unknown>, ...keys: string[]) => { for (const k of keys) if (typeof r[k] === "string" || typeof r[k] === "number") return String(r[k]); return null; };
const nested = (r: Record<string, unknown>, key: string) => rec(r[key]);
const list = (v: unknown, resource: string) => {
  const root = rec(v);
  const data = root?.data ?? root?.[resource] ?? root?.[`${resource}s`] ?? root?.items ?? v;
  return Array.isArray(data) ? data.map(rec).filter(Boolean) as Record<string, unknown>[] : [];
};
const nextCursor = (v: unknown) => {
  const root = rec(v);
  const meta = rec(root?.meta);
  const links = rec(root?.links);
  return str(meta ?? {}, "next_cursor", "nextCursor") ?? str(links ?? {}, "next_cursor", "nextCursor");
};

function configuredPath(name: string, fallback: string) {
  return process.env[name]?.trim() || fallback;
}

async function fetchAll(path: string, resource: string) {
  const records: Record<string, unknown>[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 50; page++) {
    const query = new URLSearchParams({ "page[size]": "100", sort: "id" });
    if (cursor) query.set("page[cursor]", cursor);
    const separator = path.includes("?") ? "&" : "?";
    const body = await operationsRequest(`${path}${separator}${query}`);
    records.push(...list(body, resource));
    cursor = nextCursor(body);
    if (!cursor) return records;
  }
  throw new Error(`Operations ${resource} pagination exceeded the safety limit.`);
}

function fleetId(row: Record<string, unknown>) {
  return str(row, "fleet_id", "fleetId", "id", "uuid", "identifier");
}

function aircraftId(row: Record<string, unknown>) {
  return str(row, "aircraft_id", "aircraftId", "id", "uuid", "identifier");
}

function aircraftType(row: Record<string, unknown>) {
  const fleet = nested(row, "fleet");
  return str(row, "icao", "icao_type", "icaoType", "type_code", "typeCode", "aircraft_type", "aircraftType", "type", "code", "name")
    ?? (fleet ? str(fleet, "icao", "icao_type", "code", "name") : null);
}

export async function syncOperationsFleetData(staffUserId?: string) {
  const result = { fleetsImported: 0, fleetsUpdated: 0, aircraftImported: 0, aircraftUpdated: 0, skipped: 0, errors: [] as string[] };
  const fleetPath = configuredPath("VAMSYS_OPERATIONS_FLEETS_PATH", "/fleets");
  const aircraftPath = configuredPath("VAMSYS_OPERATIONS_AIRCRAFT_PATH", "/aircraft");

  try {
    const fleets = await fetchAll(fleetPath, "fleets");
    for (const row of fleets) {
      try {
        const id = fleetId(row);
        if (!id) throw new Error("Fleet without id.");
        const existing = await prisma.fleet.findUnique({ where: { vamsysFleetId: id }, select: { id: true } });
        await prisma.fleet.upsert({
          where: { vamsysFleetId: id },
          update: { name: str(row, "name", "title", "code", "icao"), rawData: row as Prisma.InputJsonValue },
          create: { vamsysFleetId: id, name: str(row, "name", "title", "code", "icao"), rawData: row as Prisma.InputJsonValue },
        });
        if (existing) result.fleetsUpdated++; else result.fleetsImported++;
      } catch (error) {
        result.skipped++;
        result.errors.push(error instanceof Error ? error.message : "Unknown fleet sync error.");
      }
    }
  } catch (error) {
    result.errors.push(`Fleet endpoint ${fleetPath}: ${error instanceof Error ? error.message : "unknown error"}`);
  }

  try {
    const aircraft = await fetchAll(aircraftPath, "aircraft");
    for (const row of aircraft) {
      try {
        const id = aircraftId(row);
        if (!id) throw new Error("Aircraft without id.");
        const existing = await prisma.aircraft.findUnique({ where: { vamsysAircraftId: id }, select: { id: true } });
        await prisma.aircraft.upsert({
          where: { vamsysAircraftId: id },
          update: { registration: str(row, "registration", "reg", "tail", "tail_number", "tailNumber"), aircraftType: aircraftType(row), rawData: row as Prisma.InputJsonValue },
          create: { vamsysAircraftId: id, registration: str(row, "registration", "reg", "tail", "tail_number", "tailNumber"), aircraftType: aircraftType(row), rawData: row as Prisma.InputJsonValue },
        });
        if (existing) result.aircraftUpdated++; else result.aircraftImported++;
      } catch (error) {
        result.skipped++;
        result.errors.push(error instanceof Error ? error.message : "Unknown aircraft sync error.");
      }
    }
  } catch (error) {
    result.errors.push(`Aircraft endpoint ${aircraftPath}: ${error instanceof Error ? error.message : "unknown error"}`);
  }

  await prisma.operationsApiState.upsert({
    where: { id: "vamsys" },
    update: { status: result.errors.length ? "degraded" : "healthy", lastSuccessAt: new Date(), lastError: result.errors[0]?.slice(0, 180) ?? null },
    create: { id: "vamsys", status: result.errors.length ? "degraded" : "healthy", lastSuccessAt: new Date(), lastError: result.errors[0]?.slice(0, 180) },
  });
  await writeAuditLogSafely({
    staffUserId,
    action: "VAMSYS_OPERATIONS_FLEET_SYNCED",
    entityType: "Aircraft",
    message: `Operations fleet sync: ${result.fleetsImported} fleets imported, ${result.fleetsUpdated} fleets updated, ${result.aircraftImported} aircraft imported, ${result.aircraftUpdated} aircraft updated.`,
    metadata: {
      fleetsImported: result.fleetsImported,
      fleetsUpdated: result.fleetsUpdated,
      aircraftImported: result.aircraftImported,
      aircraftUpdated: result.aircraftUpdated,
      skipped: result.skipped,
      errors: result.errors.length,
      firstError: result.errors[0]?.slice(0, 180) ?? null,
    },
  });
  return result;
}
