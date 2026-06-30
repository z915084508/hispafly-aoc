import { prisma } from "@/lib/prisma";
import { writeAuditLogSafely } from "@/lib/audit/log";
import { calculateFuelCostSnapshot } from "@/lib/economy/fuel";
import { generateCompanyExpensesForPirep } from "@/lib/economy/companyExpenses";
import { extractVamsysPirepMetrics } from "@/lib/vamsys/pirepMetrics";

export type CompanyEconomyBackfillResult = {
  scanned: number;
  fuelUpdated: number;
  expensesGenerated: number;
  skipped: number;
  errors: string[];
};

export async function backfillCompanyEconomy(staffUserId?: string, limit = 500): Promise<CompanyEconomyBackfillResult> {
  const result: CompanyEconomyBackfillResult = { scanned: 0, fuelUpdated: 0, expensesGenerated: 0, skipped: 0, errors: [] };
  const pireps = await prisma.pirep.findMany({
    where: { status: "accepted" },
    select: {
      id: true,
      departure: true,
      fuelUsed: true,
      cargoKg: true,
      fuelCostCents: true,
      flownAt: true,
      vamsysUpdatedAt: true,
      rawData: true,
      companyExpenses: { select: { id: true } },
    },
    orderBy: [{ flownAt: "desc" }, { createdAt: "desc" }],
    take: Math.max(1, Math.min(limit, 1000)),
  });

  for (const pirep of pireps) {
    result.scanned++;
    try {
      const metrics = extractVamsysPirepMetrics(pirep.rawData);
      const fuelUsed = pirep.fuelUsed ?? metrics.fuelUsedKg;
      const cargoKg = pirep.cargoKg ?? metrics.cargoKg;
      let fuelSnapshot = null;

      if (pirep.fuelCostCents === null && fuelUsed && fuelUsed > 0) {
        fuelSnapshot = await calculateFuelCostSnapshot({ departure: pirep.departure, fuelUsedKg: fuelUsed, at: pirep.flownAt ?? pirep.vamsysUpdatedAt });
      }

      const data = {
        ...(pirep.fuelUsed === null && fuelUsed !== null ? { fuelUsed } : {}),
        ...(pirep.cargoKg === null && cargoKg !== null ? { cargoKg } : {}),
        ...(fuelSnapshot?.fuelCostCents !== null && fuelSnapshot !== null ? fuelSnapshot : {}),
      };

      if (Object.keys(data).length > 0) {
        await prisma.pirep.update({ where: { id: pirep.id }, data });
        if (fuelSnapshot?.fuelCostCents !== null && fuelSnapshot !== null) result.fuelUpdated++;
        if (metrics.fuelField || metrics.cargoField) console.info(`[Company economy backfill] ${pirep.id} metrics fuel=${metrics.fuelField ?? "none"} cargo=${metrics.cargoField ?? "none"}`);
      }

      const generated = await generateCompanyExpensesForPirep(pirep.id);
      result.expensesGenerated += generated.generated;
    } catch (error) {
      result.skipped++;
      result.errors.push(error instanceof Error ? error.message : "Unknown company economy backfill error.");
    }
  }

  await writeAuditLogSafely({
    staffUserId,
    action: "COMPANY_ECONOMY_BACKFILLED",
    entityType: "CompanyExpense",
    message: `Company economy backfill scanned ${result.scanned} accepted PIREPs, updated ${result.fuelUpdated} fuel snapshots and generated/recalculated ${result.expensesGenerated} expense rows.`,
    metadata: {
      scanned: result.scanned,
      fuelUpdated: result.fuelUpdated,
      expensesGenerated: result.expensesGenerated,
      skipped: result.skipped,
      errors: result.errors.length,
      firstError: result.errors[0]?.slice(0, 180) ?? null,
    },
  });

  return result;
}
