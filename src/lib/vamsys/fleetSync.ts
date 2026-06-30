import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLogSafely } from "@/lib/audit/log";
import { operationsRequest } from "./operations";

type Row = Record<string, unknown>;

export type FleetSyncResult = {
  fleetsImported: number;
  fleetsUpdated: number;
  aircraftImported: number;
  aircraftUpdated: number;
  errors: string[];
};

const rec = (value: unknown): Row | null => value && typeof value === "object" && !Array.isArray(value) ? value as Row : null;
const list = (value: unknown) => {
  const root = rec(value);
  const data = root?.data ?? root?.fleet ?? root?.fleets ?? value;
  return Array.isArray(data) ? data.map(rec).filter(Boolean) as Row[] : [];
};
const str = (row: Row, ...keys: string[]) => {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" || typeof value === "number") return String(value);
  }
  return null;
};

async function fetchFleetRows() {
  const rows: Row[] = [];
  const body = await operationsRequest("/fleet");
  rows.push(...list(body));
  return rows;
}

export async function syncOperationsFleetData(staffUserId?: string): Promise<FleetSyncResult> {
  const result: FleetSyncResult = { fleetsImported: 0, fleetsUpdated: 0, aircraftImported: 0, aircraftUpdated: 0, errors: [] };
  try {
    const fleets = await fetchFleetRows();
    for (const fleet of fleets) {
      try {
        const fleetId = str(fleet, "id", "fleet_id", "fleetId", "uuid");
        if (!fleetId) throw new Error("Fleet without id.");
        const existingFleet = await prisma.fleet.findUnique({ where: { vamsysFleetId: fleetId }, select: { id: true } });
        await prisma.fleet.upsert({
          where: { vamsysFleetId: fleetId },
          update: { name: str(fleet, "name", "code", "icao"), rawData: fleet as Prisma.InputJsonValue },
          create: { vamsysFleetId: fleetId, name: str(fleet, "name", "code", "icao"), rawData: fleet as Prisma.InputJsonValue },
        });
        if (existingFleet) result.fleetsUpdated++; else result.fleetsImported++;

        for (const aircraft of list(fleet.aircraft)) {
          const aircraftId = str(aircraft, "id", "aircraft_id", "aircraftId", "registration");
          if (!aircraftId) continue;
          const existingAircraft = await prisma.aircraft.findUnique({ where: { vamsysAircraftId: aircraftId }, select: { id: true } });
          await prisma.aircraft.upsert({
            where: { vamsysAircraftId: aircraftId },
            update: {
              registration: str(aircraft, "registration", "tail_number", "tailNumber"),
              aircraftType: str(aircraft, "aircraft_type", "aircraftType", "type", "icao"),
              rawData: aircraft as Prisma.InputJsonValue,
            },
            create: {
              vamsysAircraftId: aircraftId,
              registration: str(aircraft, "registration", "tail_number", "tailNumber"),
              aircraftType: str(aircraft, "aircraft_type", "aircraftType", "type", "icao"),
              rawData: aircraft as Prisma.InputJsonValue,
            },
          });
          if (existingAircraft) result.aircraftUpdated++; else result.aircraftImported++;
        }
      } catch (error) {
        result.errors.push(error instanceof Error ? error.message : "Unknown fleet sync error.");
      }
    }
    await prisma.operationsApiState.upsert({
      where: { id: "vamsys" },
      update: { status: result.errors.length ? "degraded" : "healthy", lastSuccessAt: new Date(), lastError: result.errors[0]?.slice(0, 180) ?? null },
      create: { id: "vamsys", status: result.errors.length ? "degraded" : "healthy", lastSuccessAt: new Date(), lastError: result.errors[0]?.slice(0, 180) },
    });
    await writeAuditLogSafely({
      staffUserId,
      action: "VAMSYS_OPERATIONS_FLEET_SYNCED",
      entityType: "Fleet",
      message: `Operations fleet sync: ${result.fleetsImported} fleets imported, ${result.fleetsUpdated} fleets updated, ${result.aircraftImported} aircraft imported and ${result.aircraftUpdated} aircraft updated.`,
      metadata: {
        fleetsImported: result.fleetsImported,
        fleetsUpdated: result.fleetsUpdated,
        aircraftImported: result.aircraftImported,
        aircraftUpdated: result.aircraftUpdated,
        errors: result.errors.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown fleet sync error.";
    result.errors.push(message);
    await prisma.operationsApiState.upsert({
      where: { id: "vamsys" },
      update: { status: "error", lastError: message.slice(0, 180) },
      create: { id: "vamsys", status: "error", lastError: message.slice(0, 180) },
    });
  }
  return result;
}
