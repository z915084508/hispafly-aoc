import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLogSafely } from "@/lib/audit/log";

const env = (name: string, fallback = "") => process.env[name]?.trim() || fallback;
export const isOperationsConfigured = () => Boolean(env("VAMSYS_OPERATIONS_CLIENT_ID") && env("VAMSYS_OPERATIONS_CLIENT_SECRET"));
let cached: { token: string; expiresAt: number } | null = null;

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}) {
  const timeoutMs = Number(env("VAMSYS_OPERATIONS_TIMEOUT_MS", "10000"));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`vAMSYS Operations request timed out after ${Math.max(1000, timeoutMs) / 1000}s.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getOperationsAccessToken(force = false) {
  if (!force && cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const clientId = env("VAMSYS_OPERATIONS_CLIENT_ID"), secret = env("VAMSYS_OPERATIONS_CLIENT_SECRET");
  if (!clientId || !secret) throw new Error("La API Operations de vAMSYS no está configurada.");
  const response = await fetchWithTimeout(env("VAMSYS_OPERATIONS_TOKEN_URL", "https://vamsys.io/oauth/token"), { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: secret, scope: "*" }), cache: "no-store" });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || typeof body.access_token !== "string") throw new Error(`vAMSYS rechazó las credenciales Operations (${response.status}).`);
  cached = { token: body.access_token, expiresAt: Date.now() + (typeof body.expires_in === "number" ? body.expires_in : 604800) * 1000 };
  return cached.token;
}

function mapPilotIncrementalData(detail: Record<string, unknown>, externalId: string) {
  const firstName = str(detail, "first_name", "firstName") ?? nestedStr(detail, "user", "first_name", "firstName");
  const lastName = str(detail, "last_name", "lastName") ?? nestedStr(detail, "user", "last_name", "lastName");
  const callsign = str(detail, "callsign", "pilot_callsign");
  const suppliedName = str(detail, "name", "display_name", "displayName", "full_name", "fullName");
  const displayName = suppliedName ?? ([firstName, lastName].filter(Boolean).join(" ") || callsign || `Piloto ${externalId}`);
  const hubId = str(detail, "hub_id", "hubId");
  const base = icao(str(detail, "base_icao", "hub_icao", "icao")) ?? icao(nestedStr(detail, "hub", "icao", "icao_code", "code"));
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
    hubId,
    base,
    operationsRawData: detail as Prisma.InputJsonValue,
    lastOperationsSyncAt: new Date(),
  };
}

async function fetchIncrementalOperationPilots(maxPages: number, since?: Date) {
  const pilots: Record<string, unknown>[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < maxPages; page++) {
    let body: Record<string, unknown> | null;
    try {
      body = rec(await fetchOperationsPilotsIncrementalPage(cursor ?? undefined, since));
    } catch (error) {
      if (!since || page > 0) throw error;
      console.warn("[vAMSYS Pilot cron] updated_at filter failed; retrying the first pages without date filter.");
      body = rec(await fetchOperationsPilotsIncrementalPage(undefined, undefined));
    }
    const data = list(body);
    pilots.push(...data);
    const meta = rec(body?.meta); cursor = meta ? str(meta, "next_cursor", "nextCursor") : null;
    console.info(`[vAMSYS Pilot cron] page=${page + 1} records=${data.length} next=${cursor ?? "none"}`);
    if (!cursor) break;
  }
  return pilots;
}

export async function syncOperationsPilotsIncremental(options: { maxPages?: number; cron?: boolean } = {}) {
  const maxPages = Math.max(1, Math.min(options.maxPages ?? 3, 3));
  const state = await prisma.operationsApiState.findUnique({ where: { id: "vamsys" } }).catch(() => null);
  const since = state?.lastCronPilotSyncAt ?? state?.lastPilotSyncAt ?? undefined;
  let imported = 0, updated = 0, skipped = 0; const errors: string[] = [];
  const now = new Date();

  try {
    const summaries = await fetchIncrementalOperationPilots(maxPages, since);
    for (const summary of summaries) try {
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
    await writeAuditLogSafely({ action: "VAMSYS_OPERATIONS_PILOT_CRON_FAILED", entityType: "Pilot", message: `Falló el cron de pilotos Operations: ${message}`, metadata: { imported, updated, skipped, errors: errors.length } });
  }

  return { imported, updated, skipped, errors };
}

export async function operationsRequest(path: string, retry = true): Promise<unknown> {
  const token = await getOperationsAccessToken();
  const baseUrl = env("VAMSYS_OPERATIONS_API_BASE_URL", "https://vamsys.io/api/v3/operations");
  const base = new URL(baseUrl);
  const target = /^https?:\/\//i.test(path)
    ? new URL(path)
    : path.startsWith(base.pathname)
      ? new URL(path, base.origin)
      : new URL(`${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`);
  if (target.origin !== base.origin || !target.pathname.startsWith(`${base.pathname.replace(/\/$/, "")}/`)) {
    throw new Error("vAMSYS devolvió una URL de paginación fuera del API Operations configurado.");
  }
  const response = await fetchWithTimeout(target, { headers: { Accept: "application/json", Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (response.status === 401 && retry) { cached = null; await getOperationsAccessToken(true); return operationsRequest(path, false); }
  if (response.status === 429) throw new Error("vAMSYS ha alcanzado el límite de 100 solicitudes por minuto.");
  if (!response.ok) throw new Error(`vAMSYS Operations respondió ${response.status}.`);
  return response.json();
}

const rec = (v: unknown): Record<string, unknown> | null => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
const list = (v: unknown) => { const root = rec(v); const data = root?.data ?? root?.pilots ?? root?.notes ?? v; return Array.isArray(data) ? data.map(rec).filter(Boolean) as Record<string, unknown>[] : []; };
const str = (r: Record<string, unknown>, ...keys: string[]) => { for (const k of keys) if (typeof r[k] === "string" || typeof r[k] === "number") return String(r[k]); return null; };
const nested = (r: Record<string, unknown>, key: string) => rec(r[key]);
const nestedStr = (r: Record<string, unknown>, parent: string, ...keys: string[]) => {
  const value = nested(r, parent);
  return value ? str(value, ...keys) : null;
};
const icao = (value: string | null) => value && /^[A-Z]{4}$/i.test(value.trim()) ? value.trim().toUpperCase() : null;
const unwrap = (v: unknown) => { const root = rec(v); return rec(root?.data) ?? root; };
const date = (v: string | null) => v && !Number.isNaN(new Date(v).getTime()) ? new Date(v) : null;

export const fetchOperationsPilots = (cursor?: string) => {
  const query = new URLSearchParams({ "page[size]": "50", sort: "id" });
  if (cursor) query.set("page[cursor]", cursor);
  return operationsRequest(`/pilots?${query}`);
};
export const fetchOperationsPilotsIncrementalPage = (cursor?: string, since?: Date) => {
  const query = new URLSearchParams({ "page[size]": "50", sort: "-updated_at" });
  if (cursor) query.set("page[cursor]", cursor);
  if (since) query.set("filter[updated_at][gte]", since.toISOString());
  return operationsRequest(`/pilots?${query}`);
};
export const fetchOperationsPilot = (id: string) => operationsRequest(`/pilots/${encodeURIComponent(id)}`);
export const fetchOperationsPilotNotes = (id: string) => operationsRequest(`/pilots/${encodeURIComponent(id)}/notes`);

async function fetchAllOperationsPilots() {
  const pilots: Record<string, unknown>[] = []; let cursor: string | null = null;
  for (let page = 0; page < 100; page++) {
    const body = rec(await fetchOperationsPilots(cursor ?? undefined));
    pilots.push(...list(body));
    const meta = rec(body?.meta); cursor = meta ? str(meta, "next_cursor", "nextCursor") : null;
    if (!cursor) return pilots;
  }
  throw new Error("La paginación de pilotos superó el límite de seguridad.");
}

async function fetchAllOperationsResource(resource: "hubs" | "airports" | "ranks") {
  const records: Record<string, unknown>[] = []; let cursor: string | null = null;
  for (let page = 0; page < 100; page++) {
    const query = new URLSearchParams({ "page[size]": "100", sort: "id" });
    if (cursor) query.set("page[cursor]", cursor);
    const body = rec(await operationsRequest(`/${resource}?${query}`));
    records.push(...list(body));
    const meta = rec(body?.meta); cursor = meta ? str(meta, "next_cursor", "nextCursor") : null;
    if (!cursor) return records;
  }
  throw new Error(`La paginacion de ${resource} supero el limite de seguridad.`);
}

async function fetchOperationsDirectoryLookups() {
  const [hubs, airports, ranks] = await Promise.all([
    fetchAllOperationsResource("hubs"),
    fetchAllOperationsResource("airports"),
    fetchAllOperationsResource("ranks"),
  ]);
  const byId = (records: Record<string, unknown>[]) => new Map(records.map((record) => [str(record, "id"), record]).filter((entry): entry is [string, Record<string, unknown>] => Boolean(entry[0])));
  return { hubs: byId(hubs), airports: byId(airports), ranks: byId(ranks) };
}

function idList(record: Record<string, unknown> | undefined, key: string) {
  const value = record?.[key];
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" || typeof item === "number").map(String) : [];
}

async function removeDefaultMockWorkflow() {
  const mockPilots = await prisma.pilot.findMany({ where: { vamsysPilotId: { startsWith: "VMS-HSP-" } }, select: { id: true } });
  const pilotIds = mockPilots.map((pilot) => pilot.id); if (!pilotIds.length) return 0;
  await prisma.$transaction(async (tx) => {
    await tx.walletTransaction.deleteMany({ where: { pilotId: { in: pilotIds } } });
    await tx.payrollRecord.deleteMany({ where: { pilotId: { in: pilotIds } } });
    await tx.pirep.deleteMany({ where: { pilotId: { in: pilotIds } } });
    await tx.pilotNote.deleteMany({ where: { pilotId: { in: pilotIds } } });
    await tx.pilot.deleteMany({ where: { id: { in: pilotIds } } });
  });
  return pilotIds.length;
}

export async function checkOperationsHealth() {
  try { await getOperationsAccessToken(true); const now = new Date(); await prisma.operationsApiState.upsert({ where: { id: "vamsys" }, update: { status: "healthy", lastCheckedAt: now, lastSuccessAt: now, lastError: null }, create: { id: "vamsys", status: "healthy", lastCheckedAt: now, lastSuccessAt: now } }); return { healthy: true, message: "Conexión correcta." }; }
  catch (error) { const message = error instanceof Error ? error.message : "Error desconocido."; await prisma.operationsApiState.upsert({ where: { id: "vamsys" }, update: { status: "error", lastCheckedAt: new Date(), lastError: message.slice(0, 180) }, create: { id: "vamsys", status: "error", lastCheckedAt: new Date(), lastError: message.slice(0, 180) } }); return { healthy: false, message }; }
}

export async function syncOperationsPilots(staffUserId?: string) {
  const summaries = await fetchAllOperationsPilots(); let imported = 0, updated = 0, notes = 0; const errors: string[] = [];
  if (!summaries.length) throw new Error("vAMSYS Operations no devolvió ningún piloto; no se eliminaron datos locales.");
  const lookups = await fetchOperationsDirectoryLookups();
  for (const summary of summaries) try {
    const externalId = str(summary, "pilot_id", "pilotId", "id", "uuid"); if (!externalId) throw new Error("Piloto sin ID.");
    const detailResponse = unwrap(await fetchOperationsPilot(externalId)) ?? summary;
    const detail = { ...summary, ...detailResponse };
    const existing = await prisma.pilot.findUnique({ where: { vamsysPilotId: externalId }, select: { id: true } });
    const firstName = str(detail, "first_name", "firstName") ?? nestedStr(detail, "user", "first_name", "firstName");
    const lastName = str(detail, "last_name", "lastName") ?? nestedStr(detail, "user", "last_name", "lastName");
    const callsign = str(detail, "callsign", "pilot_callsign");
    const suppliedName = str(detail, "name", "display_name", "displayName", "full_name", "fullName");
    const displayName = suppliedName ?? ([firstName, lastName].filter(Boolean).join(" ") || callsign || `Piloto ${externalId}`);
    const prefersHonorary = detail.prefer_honorary_rank === true;
    const rankId = prefersHonorary ? str(detail, "honorary_rank_id", "honoraryRankId") ?? str(detail, "rank_id", "rankId") : str(detail, "rank_id", "rankId");
    const rank = rankId ? lookups.ranks.get(rankId) : undefined;
    const rankName = str(detail, "rank_name", "rankName") ?? nestedStr(detail, "rank", "name", "title") ?? nestedStr(detail, "honorary_rank", "name", "title") ?? (rank ? str(rank, "name") : null);
    const rankAbbreviation = str(detail, "rank_abbreviation", "rankAbbreviation") ?? nestedStr(detail, "rank", "abbreviation", "abbr", "code") ?? (rank ? str(rank, "abbreviation") : null);
    const hubId = str(detail, "hub_id", "hubId");
    const hub = hubId ? lookups.hubs.get(hubId) : undefined;
    const hubAirports = idList(hub, "airport_ids").map((id) => lookups.airports.get(id)).filter((airport): airport is Record<string, unknown> => Boolean(airport));
    const airportLabel = hubAirports.map((airport) => { const code = icao(str(airport, "icao")); const name = str(airport, "name"); return code && name ? `${code} - ${name}` : code ?? name; }).filter(Boolean).join(", ");
    const base = airportLabel || str(hub ?? {}, "name") || icao(str(detail, "base_icao", "hub_icao", "icao")) || icao(nestedStr(detail, "hub", "icao", "icao_code", "code")) || icao(nestedStr(detail, "location", "icao", "icao_code", "code"));
    const data = { username: str(detail, "username") ?? nestedStr(detail, "user", "username"), firstName, lastName, displayName, email: str(detail, "email") ?? nestedStr(detail, "user", "email"), callsign, vatsimId: str(detail, "vatsim_id", "vatsimId"), ivaoId: str(detail, "ivao_id", "ivaoId"), rankName, rankAbbreviation, hubId, base, operationsRawData: detail as Prisma.InputJsonValue, lastOperationsSyncAt: new Date() };
    const pilot = await prisma.pilot.upsert({ where: { vamsysPilotId: externalId }, update: data, create: { vamsysPilotId: externalId, ...data } });
    if (existing) updated++; else imported++;
    for (const note of list(await fetchOperationsPilotNotes(externalId))) { const noteId = str(note, "note_id", "noteId", "id"); if (!noteId) continue; await prisma.pilotNote.upsert({ where: { vamsysNoteId: noteId }, update: { content: str(note, "content", "note", "text"), authorName: str(note, "author_name", "author"), rawData: note as Prisma.InputJsonValue, sourceUpdatedAt: date(str(note, "updated_at", "updatedAt")), synchronizedAt: new Date() }, create: { vamsysNoteId: noteId, pilotId: pilot.id, content: str(note, "content", "note", "text"), authorName: str(note, "author_name", "author"), rawData: note as Prisma.InputJsonValue, sourceCreatedAt: date(str(note, "created_at", "createdAt")), sourceUpdatedAt: date(str(note, "updated_at", "updatedAt")) } }); notes++; }
  } catch (error) { errors.push(error instanceof Error ? error.message : "Error desconocido"); }
  const removedMocks = await removeDefaultMockWorkflow();
  await prisma.operationsApiState.upsert({ where: { id: "vamsys" }, update: { status: errors.length ? "degraded" : "healthy", lastPilotSyncAt: new Date(), lastError: errors[0]?.slice(0, 180) ?? null }, create: { id: "vamsys", status: errors.length ? "degraded" : "healthy", lastPilotSyncAt: new Date(), lastError: errors[0]?.slice(0, 180) } });
  await writeAuditLogSafely({ staffUserId, action: "VAMSYS_OPERATIONS_PILOTS_SYNCED", entityType: "Pilot", message: `Sincronización Operations: ${imported} pilotos nuevos, ${updated} actualizados y ${notes} notas.`, metadata: { imported, updated, notes, errors: errors.length } });
  return { imported, updated, notes, removedMocks, errors };
}
