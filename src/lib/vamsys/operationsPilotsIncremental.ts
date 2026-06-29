import { prisma } from "@/lib/prisma";
import { writeAuditLogSafely } from "@/lib/audit/log";
import { operationsRequest } from "./operations";

type Row = Record<string, unknown>;

const rec = (value: unknown): Row | null => value && typeof value === "object" && !Array.isArray(value) ? value as Row : null;
const list = (value: unknown) => {
  const root = rec(value);
  const data = root?.data ?? root?.pilots ?? value;
  return Array.isArray(data) ? data.map(rec).filter(Boolean) as Row[] : [];
};
const str = (row: Row | null | undefined, ...keys: string[]) => {
  if (!row) return null;
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" || typeof value === "number") return String(value);
  }
  return null;
};
const nested = (row: Row, key: string) => rec(row[key]);
const nestedStr = (row: Row, parent: string, ...keys: string[]) => str(nested(row, parent), ...keys);
const icao = (value: string | null) => value && /^[A-Z]{4}$/i.test(value.trim()) ? value.trim().toUpperCase() : null;

async function fetchOperationsPilotsIncrementalPage(cursor?: string, since?: Date) {
  const query = new URLSearchParams({ "page[size]": "50", sort: "-updated_at" });
  if (cursor) query.set("page[cursor]", cursor);
  if (since) query.set("filter[updated_at][gte]", since.toISOString());
  return operationsRequest(`/pilots?${query}`);
}

function mapPilotIncrementalData(detail: Row, externalId: string) {
  const firstName = str(detail, "first_name", "firstName") ?? nestedStr(detail, "user", "first_name", "firstName");
  const lastName = str(detail, "last_name", "lastName") ?? nestedStr(detail, "user", "last_name", "lastName");
  const callsign = str(detail, "callsign", "pilot_callsign");
  const suppliedName = str(detail, "name", "display_name", "displayName", "full_name", "fullName");
  const displayName = suppliedName ?? ([firstName, lastName].filter(Boolean).join(" ") || callsign || `Piloto ${externalId}`);
  return {
    username: str(detail, "username") ?? nestedStr(detail, "user", "username"),
    firstName,
    lastName,
    displayName,
    email: str(detail, "email") ?? nestedStr(detail, "user", "email"),
    callsign,
    vatsimId: str(detail, "vatsim_id", "vatsimId"),
    ivaoId: str(detail, "ivao_id", "ivaoId"),
    rankName: str(detail, "rank_name", "rankName") ?? nestedStr(detail, "rank", "name", "title"),
    rankAbbreviation: str(detail, "rank_abbreviation", "rankAbbreviation") ?? nestedStr(detail, "rank", "abbreviation", "abbr", "code"),
    hubId: str(detail, "hub_id", "hubId"),
    base: icao(str(detail, "base_icao", "hub_icao", "icao")) ?? icao(nestedStr(detail, "hub", "icao", "icao_code", "code")),
  };
}

async function fetchIncrementalOperationPilots(maxPages: number, since?: Date) {
  const pilots: Row[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < maxPages; page++) {
    let body: Row | null;
    try {
      body = rec(await fetchOperationsPilotsIncrementalPage(cursor ?? undefined, since));
    } catch (error) {
      if (!since || page > 0) throw error;
      console.warn("[vAMSYS Pilot cron] updated_at filter failed; retrying the first pages without date filter.");
      body = rec(await fetchOperationsPilotsIncrementalPage(undefined, undefined));
    }
    const data = list(body);
    pilots.push(...data);
    const meta = rec(body?.meta);
    cursor = meta ? str(meta, "next_cursor", "nextCursor") : null;
    console.info(`[vAMSYS Pilot cron] page=${page + 1} records=${data.length} next=${cursor ?? "none"}`);
    if (!cursor) break;
  }
  return pilots;
}

export async function syncOperationsPilotsIncremental(options: { maxPages?: number; cron?: boolean } = {}) {
  const maxPages = Math.max(1, Math.min(options.maxPages ?? 3, 3));
  const state = await prisma.operationsApiState.findUnique({ where: { id: "vamsys" } }).catch(() => null);
  const since = state?.lastCronPilotSyncAt ?? state?.lastPilotSyncAt ?? undefined;
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];
  const now = new Date();

  try {
    const summaries = await fetchIncrementalOperationPilots(maxPages, since);
    for (const summary of summaries) {
      try {
        const externalId = str(summary, "pilot_id", "pilotId", "id", "uuid");
        if (!externalId) throw new Error("Piloto sin ID.");
        const existing = await prisma.pilot.findUnique({ where: { vamsysPilotId: externalId }, select: { id: true } });
        const data = mapPilotIncrementalData(summary, externalId);
        await prisma.pilot.upsert({ where: { vamsysPilotId: externalId }, update: data, create: { vamsysPilotId: externalId, ...data } });
        if (existing) updated++; else imported++;
      } catch (error) {
        skipped++;
        errors.push(error instanceof Error ? error.message : "Error desconocido");
      }
    }

    await prisma.operationsApiState.upsert({
      where: { id: "vamsys" },
      update: { status: errors.length ? "degraded" : "healthy", lastPilotSyncAt: now, lastCronPilotSyncAt: options.cron ? now : state?.lastCronPilotSyncAt, lastError: errors[0]?.slice(0, 180) ?? null },
      create: { id: "vamsys", status: errors.length ? "degraded" : "healthy", lastPilotSyncAt: now, lastCronPilotSyncAt: options.cron ? now : null, lastError: errors[0]?.slice(0, 180) },
    });
    console.info(`[vAMSYS Pilot cron] completed imported=${imported} updated=${updated} skipped=${skipped} errors=${errors.length}`);
    await writeAuditLogSafely({ action: "VAMSYS_OPERATIONS_PILOT_CRON_SYNCED", entityType: "Pilot", message: `Cron Operations pilots: ${imported} nuevos, ${updated} actualizados y ${skipped} omitidos.`, metadata: { imported, updated, skipped, errors: errors.length } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido.";
    errors.push(message);
    await prisma.operationsApiState.upsert({ where: { id: "vamsys" }, update: { status: "error", lastCronPilotSyncAt: options.cron ? now : state?.lastCronPilotSyncAt, lastError: message.slice(0, 180) }, create: { id: "vamsys", status: "error", lastCronPilotSyncAt: options.cron ? now : null, lastError: message.slice(0, 180) } });
    await writeAuditLogSafely({ action: "VAMSYS_OPERATIONS_PILOT_CRON_FAILED", entityType: "Pilot", message: `Fallo el cron de pilotos Operations: ${message}`, metadata: { imported, updated, skipped, errors: errors.length } });
  }

  return { imported, updated, skipped, errors };
}
