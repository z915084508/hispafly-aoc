import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLogSafely } from "@/lib/audit/log";
import { calculatePayroll, creditsToCents } from "@/lib/payroll/calculatePayroll";
import { payrollRulesFromStoredRule } from "@/lib/payroll/rules";
import { operationsRequest } from "./operations";
import { nextVamsysCursor, nextVamsysPageUrl } from "./pagination";
import { mergeOperationsPirepRecords } from "./operationsPirepPayload";
import { mapOperationsPirep, type OperationsPirepSyncResult } from "./operationsPireps";

type Row = Record<string, unknown>;
const rec = (value: unknown): Row | null => value && typeof value === "object" && !Array.isArray(value) ? value as Row : null;

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

    for (const summary of rows) {
      try {
        const summaryMapped = mapOperationsPirep(summary);
        const detailBody = rec(await operationsRequest(`/pireps/${encodeURIComponent(summaryMapped.data.vamsysPirepId)}`));
        const detail = rec(detailBody?.data) ?? summary;
        const mapped = mapOperationsPirep(mergeOperationsPirepRecords(summary, detail));
        if (!mapped.pilotExternalId) throw new Error(`PIREP ${mapped.data.vamsysPirepId} sin pilot_id.`);

        const pilot = await prisma.pilot.upsert({ where: { vamsysPilotId: mapped.pilotExternalId }, update: {}, create: { vamsysPilotId: mapped.pilotExternalId, displayName: `Piloto ${mapped.pilotExternalId}` } });
        const existing = await prisma.pirep.findUnique({ where: { vamsysPirepId: mapped.data.vamsysPirepId }, select: { id: true } });
        const stored = await prisma.pirep.upsert({ where: { vamsysPirepId: mapped.data.vamsysPirepId }, update: { ...mapped.data, pilotId: pilot.id }, create: { ...mapped.data, pilotId: pilot.id }, include: { payrollRecord: true } });
        if (existing) result.updatedCount++; else result.importedCount++;

        if (!stored.payrollRecord && rule) {
          const calc = calculatePayroll(mapped.data, payrollRulesFromStoredRule(rule));
          try {
            await prisma.payrollRecord.create({ data: { pirepId: stored.id, pilotId: pilot.id, payrollRuleId: rule.id, basePayCents: creditsToCents(calc.basePay), bonusCents: creditsToCents(calc.totalBonus), penaltyCents: creditsToCents(calc.penalties), amountCents: creditsToCents(calc.finalAmount), calculationDetails: { ...calc }, settlementMonth: mapped.data.flownAt.toISOString().slice(0, 7) } });
            result.payrollGeneratedCount++;
          } catch (error) {
            if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
          }
        }
      } catch (error) {
        result.skippedCount++;
        result.errors.push(error instanceof Error ? error.message : "Error desconocido.");
      }
    }

    await prisma.operationsApiState.upsert({
      where: { id: "vamsys" },
      update: { status: result.errors.length ? "degraded" : "healthy", lastPirepSyncAt: now, lastCronPirepSyncAt: options.cron ? now : state?.lastCronPirepSyncAt, lastError: result.errors[0]?.slice(0, 180) ?? null },
      create: { id: "vamsys", status: result.errors.length ? "degraded" : "healthy", lastPirepSyncAt: now, lastCronPirepSyncAt: options.cron ? now : null, lastError: result.errors[0]?.slice(0, 180) },
    });
    console.info(`[vAMSYS PIREP cron] completed imported=${result.importedCount} updated=${result.updatedCount} skipped=${result.skippedCount} payrollGenerated=${result.payrollGeneratedCount} errors=${result.errors.length}`);
    await writeAuditLogSafely({ action: "VAMSYS_OPERATIONS_PIREP_CRON_COMPLETED", entityType: "Pirep", message: `Cron Operations PIREPs: ${result.importedCount} nuevos, ${result.updatedCount} actualizados, ${result.skippedCount} omitidos y ${result.payrollGeneratedCount} nominas.`, metadata: { imported: result.importedCount, updated: result.updatedCount, skipped: result.skippedCount, payrollGenerated: result.payrollGeneratedCount, errors: result.errors.length } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido.";
    result.errors.push(message);
    await prisma.operationsApiState.upsert({ where: { id: "vamsys" }, update: { status: "error", lastCronPirepSyncAt: options.cron ? now : state?.lastCronPirepSyncAt, lastError: message.slice(0, 180) }, create: { id: "vamsys", status: "error", lastCronPirepSyncAt: options.cron ? now : null, lastError: message.slice(0, 180) } });
    await writeAuditLogSafely({ action: "VAMSYS_OPERATIONS_PIREP_CRON_FAILED", entityType: "Pirep", message: `Fallo el cron incremental de PIREPs: ${message}`, metadata: { imported: result.importedCount, updated: result.updatedCount, skipped: result.skippedCount, payrollGenerated: result.payrollGeneratedCount, errors: result.errors.length } });
  }

  return result;
}
