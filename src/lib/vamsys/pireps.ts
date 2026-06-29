import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLogSafely } from "@/lib/audit/log";
import { calculatePayroll, creditsToCents } from "@/lib/payroll/calculatePayroll";
import { payrollRulesFromStoredRule } from "@/lib/payroll/rules";
import { getVamsysPilotConfig } from "./config";
import { getValidVamsysAccessToken } from "./token";
import { VamsysApiError } from "./client";
import { mapVamsysPirep } from "./pirepMapper";
import { nextVamsysCursor } from "./pagination";
export { mapVamsysPirep } from "./pirepMapper";

export interface VamsysPirepFetchOptions {
  cursor?: string;
  pageSize?: number;
  sort?: string;
}

export interface VamsysPirepPage {
  items: Record<string, unknown>[];
  nextCursor: string | null;
}

export interface PirepSyncResult {
  pilotId: string;
  importedCount: number;
  updatedCount: number;
  skippedCount: number;
  payrollGeneratedCount: number;
  errors: string[];
}

export interface AllPilotsSyncResult {
  results: PirepSyncResult[];
  importedCount: number;
  updatedCount: number;
  skippedCount: number;
  payrollGeneratedCount: number;
}

interface SyncContext { staffUserId?: string | null }

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export async function fetchVamsysPireps(accessToken: string, options: VamsysPirepFetchOptions = {}): Promise<VamsysPirepPage> {
  const { apiBaseUrl } = getVamsysPilotConfig();
  const url = new URL(`${apiBaseUrl}/pireps`);
  url.searchParams.set("filter[status]", "accepted");
  url.searchParams.set("page[size]", String(options.pageSize ?? 50));
  url.searchParams.set("sort", options.sort ?? "-created_at");
  if (options.cursor) url.searchParams.set("page[cursor]", options.cursor);
  const response = await fetch(url, { headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  if (response.status === 401) throw new VamsysApiError("Token vAMSYS no autorizado.", 401, "unauthorized");
  if (response.status === 429) throw new VamsysApiError("Límite de peticiones de vAMSYS alcanzado.", 429, "rate_limited");
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new VamsysApiError(`vAMSYS PIREP request failed with status ${response.status}.`, response.status);
  const body = record(payload);
  if (!body) throw new VamsysApiError("Respuesta PIREP inesperada de vAMSYS.", 502, "invalid_response");
  const data = Array.isArray(body.data) ? body.data : Array.isArray(body.pireps) ? body.pireps : Array.isArray(body.results) ? body.results : null;
  if (!data) throw new VamsysApiError("La respuesta de vAMSYS no contiene una lista de PIREPs.", 502, "invalid_response");
  const items = data.map(record).filter((item): item is Record<string, unknown> => Boolean(item));
  return { items, nextCursor: nextVamsysCursor(body) };
}

export async function fetchAcceptedVamsysPirepsForPilot(pilotId: string) {
  let accessToken = await getValidVamsysAccessToken(pilotId);
  const items: Record<string, unknown>[] = [];
  let cursor: string | undefined;
  let refreshedAfter401 = false;
  for (let page = 0; page < 100; page++) {
    let result: VamsysPirepPage;
    try {
      result = await fetchVamsysPireps(accessToken, { cursor });
    } catch (error) {
      if (error instanceof VamsysApiError && error.status === 401 && !refreshedAfter401) {
        accessToken = await getValidVamsysAccessToken(pilotId, { forceRefresh: true });
        refreshedAfter401 = true;
        result = await fetchVamsysPireps(accessToken, { cursor });
      } else throw error;
    }
    items.push(...result.items);
    if (!result.nextCursor) return items;
    cursor = result.nextCursor;
  }
  throw new Error("vAMSYS PIREP pagination exceeded the safety limit.");
}

export async function syncAcceptedPirepsForPilot(pilotId: string, context: SyncContext = {}): Promise<PirepSyncResult> {
  const result: PirepSyncResult = { pilotId, importedCount: 0, updatedCount: 0, skippedCount: 0, payrollGeneratedCount: 0, errors: [] };
  await writeAuditLogSafely({ action: "VAMSYS_PIREP_SYNC_STARTED", entityType: "Pilot", entityId: pilotId, staffUserId: context.staffUserId, message: `Se inició la sincronización de PIREPs del piloto ${pilotId}.`, metadata: { pilotId } });
  try {
    const [rawPireps, pilot, activeRule] = await Promise.all([
      fetchAcceptedVamsysPirepsForPilot(pilotId),
      prisma.pilot.findUnique({ where: { id: pilotId } }),
      prisma.payrollRule.findFirst({ where: { isActive: true }, orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }] }),
    ]);
    if (!pilot) throw new Error("Piloto local no encontrado.");

    for (const raw of rawPireps) {
      try {
        const mapped = mapVamsysPirep(raw);
        const existing = await prisma.pirep.findUnique({ where: { vamsysPirepId: mapped.vamsysPirepId }, select: { id: true } });
        const stored = await prisma.pirep.upsert({
          where: { vamsysPirepId: mapped.vamsysPirepId },
          update: { ...mapped, pilotId },
          create: { ...mapped, pilotId },
          include: { payrollRecord: true },
        });
        if (existing) result.updatedCount++; else {
          result.importedCount++;
          await writeAuditLogSafely({ action: "VAMSYS_PIREP_IMPORTED", entityType: "Pirep", entityId: stored.id, staffUserId: context.staffUserId, message: `Se importó el PIREP vAMSYS ${mapped.vamsysPirepId} para ${pilot.callsign ?? pilot.displayName}.`, metadata: { pilotId, vamsysPirepId: mapped.vamsysPirepId } });
        }

        if (!stored.payrollRecord && activeRule && mapped.aircraftType && mapped.flightTimeMinutes !== null && mapped.network && mapped.landingRate !== null && mapped.score !== null && mapped.flownAt) {
          const calculation = calculatePayroll({ aircraftType: mapped.aircraftType, flightTimeMinutes: mapped.flightTimeMinutes, network: mapped.network, landingRate: mapped.landingRate, score: mapped.score, status: mapped.status }, payrollRulesFromStoredRule(activeRule));
          try {
            const payroll = await prisma.payrollRecord.create({ data: {
              pirepId: stored.id, pilotId, payrollRuleId: activeRule.id,
              basePayCents: creditsToCents(calculation.basePay), bonusCents: creditsToCents(calculation.totalBonus),
              penaltyCents: creditsToCents(calculation.penalties), amountCents: creditsToCents(calculation.finalAmount),
              calculationDetails: { ...calculation }, settlementMonth: mapped.flownAt.toISOString().slice(0, 7), status: "pending",
            } });
            result.payrollGeneratedCount++;
            await writeAuditLogSafely({ action: "PAYROLL_GENERATED_FROM_VAMSYS_PIREP", entityType: "PayrollRecord", entityId: payroll.id, staffUserId: context.staffUserId, message: `Se generó una nómina pendiente para el PIREP vAMSYS ${mapped.vamsysPirepId}.`, metadata: { pilotId, pirepId: stored.id, amountCents: payroll.amountCents } });
          } catch (error) {
            if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
          }
        }
      } catch (error) {
        result.skippedCount++;
        result.errors.push(error instanceof Error ? error.message : "Error PIREP desconocido.");
      }
    }
    await prisma.pilot.update({ where: { id: pilotId }, data: { lastPirepSyncAt: new Date() } });
    await writeAuditLogSafely({ action: "VAMSYS_PIREP_SYNC_COMPLETED", entityType: "Pilot", entityId: pilotId, staffUserId: context.staffUserId, message: `Sincronización completada para ${pilot.callsign ?? pilot.displayName}: ${result.importedCount} importados, ${result.updatedCount} actualizados y ${result.payrollGeneratedCount} nóminas.`, metadata: { pilotId, importedCount: result.importedCount, updatedCount: result.updatedCount, skippedCount: result.skippedCount, payrollGeneratedCount: result.payrollGeneratedCount } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error de sincronización desconocido.";
    result.errors.push(message);
    await writeAuditLogSafely({ action: "VAMSYS_PIREP_SYNC_FAILED", entityType: "Pilot", entityId: pilotId, staffUserId: context.staffUserId, message: `Falló la sincronización de PIREPs del piloto ${pilotId}: ${message}`, metadata: { pilotId, error: message.slice(0, 180) } });
  }
  return result;
}

export async function syncAcceptedPirepsForAllConnectedPilots(context: SyncContext = {}): Promise<AllPilotsSyncResult> {
  const tokens = await prisma.vamsysOAuthToken.findMany({ where: { revokedAt: null }, select: { pilotId: true }, orderBy: { pilotId: "asc" } });
  const results: PirepSyncResult[] = [];
  for (const token of tokens) results.push(await syncAcceptedPirepsForPilot(token.pilotId, context));
  return {
    results,
    importedCount: results.reduce((sum, item) => sum + item.importedCount, 0),
    updatedCount: results.reduce((sum, item) => sum + item.updatedCount, 0),
    skippedCount: results.reduce((sum, item) => sum + item.skippedCount, 0),
    payrollGeneratedCount: results.reduce((sum, item) => sum + item.payrollGeneratedCount, 0),
  };
}
