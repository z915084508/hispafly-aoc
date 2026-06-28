import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLogSafely } from "@/lib/audit/log";

const env = (name: string, fallback = "") => process.env[name]?.trim() || fallback;
export const isOperationsConfigured = () => Boolean(env("VAMSYS_OPERATIONS_CLIENT_ID") && env("VAMSYS_OPERATIONS_CLIENT_SECRET"));
let cached: { token: string; expiresAt: number } | null = null;

export async function getOperationsAccessToken(force = false) {
  if (!force && cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const clientId = env("VAMSYS_OPERATIONS_CLIENT_ID"), secret = env("VAMSYS_OPERATIONS_CLIENT_SECRET");
  if (!clientId || !secret) throw new Error("La API Operations de vAMSYS no está configurada.");
  const response = await fetch(env("VAMSYS_OPERATIONS_TOKEN_URL", "https://vamsys.io/oauth/token"), { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: secret, scope: "*" }), cache: "no-store" });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || typeof body.access_token !== "string") throw new Error(`vAMSYS rechazó las credenciales Operations (${response.status}).`);
  cached = { token: body.access_token, expiresAt: Date.now() + (typeof body.expires_in === "number" ? body.expires_in : 604800) * 1000 };
  return cached.token;
}

async function request(path: string, retry = true): Promise<unknown> {
  const token = await getOperationsAccessToken();
  const response = await fetch(`${env("VAMSYS_OPERATIONS_API_BASE_URL", "https://vamsys.io/api/v3/operations")}${path}`, { headers: { Accept: "application/json", Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (response.status === 401 && retry) { cached = null; await getOperationsAccessToken(true); return request(path, false); }
  if (response.status === 429) throw new Error("vAMSYS ha alcanzado el límite de 100 solicitudes por minuto.");
  if (!response.ok) throw new Error(`vAMSYS Operations respondió ${response.status}.`);
  return response.json();
}

const rec = (v: unknown): Record<string, unknown> | null => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
const list = (v: unknown) => { const root = rec(v); const data = root?.data ?? root?.pilots ?? root?.notes ?? v; return Array.isArray(data) ? data.map(rec).filter(Boolean) as Record<string, unknown>[] : []; };
const str = (r: Record<string, unknown>, ...keys: string[]) => { for (const k of keys) if (typeof r[k] === "string" || typeof r[k] === "number") return String(r[k]); return null; };
const unwrap = (v: unknown) => { const root = rec(v); return rec(root?.data) ?? root; };
const date = (v: string | null) => v && !Number.isNaN(new Date(v).getTime()) ? new Date(v) : null;

export const fetchOperationsPilots = () => request("/pilots");
export const fetchOperationsPilot = (id: string) => request(`/pilots/${encodeURIComponent(id)}`);
export const fetchOperationsPilotNotes = (id: string) => request(`/pilots/${encodeURIComponent(id)}/notes`);

export async function checkOperationsHealth() {
  try { await getOperationsAccessToken(true); const now = new Date(); await prisma.operationsApiState.upsert({ where: { id: "vamsys" }, update: { status: "healthy", lastCheckedAt: now, lastSuccessAt: now, lastError: null }, create: { id: "vamsys", status: "healthy", lastCheckedAt: now, lastSuccessAt: now } }); return { healthy: true, message: "Conexión correcta." }; }
  catch (error) { const message = error instanceof Error ? error.message : "Error desconocido."; await prisma.operationsApiState.upsert({ where: { id: "vamsys" }, update: { status: "error", lastCheckedAt: new Date(), lastError: message.slice(0, 180) }, create: { id: "vamsys", status: "error", lastCheckedAt: new Date(), lastError: message.slice(0, 180) } }); return { healthy: false, message }; }
}

export async function syncOperationsPilots(staffUserId?: string) {
  const summaries = list(await fetchOperationsPilots()); let imported = 0, updated = 0, notes = 0; const errors: string[] = [];
  for (const summary of summaries) try {
    const externalId = str(summary, "pilot_id", "pilotId", "id", "uuid"); if (!externalId) throw new Error("Piloto sin ID.");
    const detail = unwrap(await fetchOperationsPilot(externalId)) ?? summary; const existing = await prisma.pilot.findUnique({ where: { vamsysPilotId: externalId }, select: { id: true } });
    const firstName = str(detail, "first_name", "firstName"), lastName = str(detail, "last_name", "lastName"), callsign = str(detail, "callsign", "pilot_callsign");
    const pilot = await prisma.pilot.upsert({ where: { vamsysPilotId: externalId }, update: { username: str(detail, "username"), firstName, lastName, displayName: [firstName, lastName].filter(Boolean).join(" ") || callsign || `Piloto ${externalId}`, email: str(detail, "email"), callsign, vatsimId: str(detail, "vatsim_id", "vatsimId"), ivaoId: str(detail, "ivao_id", "ivaoId"), rankName: str(detail, "rank_name", "rankName"), hubId: str(detail, "hub_id", "hubId"), operationsRawData: detail as Prisma.InputJsonValue, lastOperationsSyncAt: new Date() }, create: { vamsysPilotId: externalId, displayName: [firstName, lastName].filter(Boolean).join(" ") || callsign || `Piloto ${externalId}`, username: str(detail, "username"), firstName, lastName, email: str(detail, "email"), callsign, vatsimId: str(detail, "vatsim_id", "vatsimId"), ivaoId: str(detail, "ivao_id", "ivaoId"), rankName: str(detail, "rank_name", "rankName"), hubId: str(detail, "hub_id", "hubId"), operationsRawData: detail as Prisma.InputJsonValue, lastOperationsSyncAt: new Date() } });
    if (existing) updated++; else imported++;
    for (const note of list(await fetchOperationsPilotNotes(externalId))) { const noteId = str(note, "note_id", "noteId", "id"); if (!noteId) continue; await prisma.pilotNote.upsert({ where: { vamsysNoteId: noteId }, update: { content: str(note, "content", "note", "text"), authorName: str(note, "author_name", "author"), rawData: note as Prisma.InputJsonValue, sourceUpdatedAt: date(str(note, "updated_at", "updatedAt")), synchronizedAt: new Date() }, create: { vamsysNoteId: noteId, pilotId: pilot.id, content: str(note, "content", "note", "text"), authorName: str(note, "author_name", "author"), rawData: note as Prisma.InputJsonValue, sourceCreatedAt: date(str(note, "created_at", "createdAt")), sourceUpdatedAt: date(str(note, "updated_at", "updatedAt")) } }); notes++; }
  } catch (error) { errors.push(error instanceof Error ? error.message : "Error desconocido"); }
  await prisma.operationsApiState.upsert({ where: { id: "vamsys" }, update: { status: errors.length ? "degraded" : "healthy", lastPilotSyncAt: new Date(), lastError: errors[0]?.slice(0, 180) ?? null }, create: { id: "vamsys", status: errors.length ? "degraded" : "healthy", lastPilotSyncAt: new Date(), lastError: errors[0]?.slice(0, 180) } });
  await writeAuditLogSafely({ staffUserId, action: "VAMSYS_OPERATIONS_PILOTS_SYNCED", entityType: "Pilot", message: `Sincronización Operations: ${imported} pilotos nuevos, ${updated} actualizados y ${notes} notas.`, metadata: { imported, updated, notes, errors: errors.length } });
  return { imported, updated, notes, errors };
}
