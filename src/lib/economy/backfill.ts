import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLogSafely } from "@/lib/audit/log";
import { calculateFuelCostSnapshot } from "@/lib/economy/fuel";
import { generateCompanyExpensesForPirep } from "@/lib/economy/companyExpenses";

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
    select: { id: true, departure: true, fuelUsed: true, fuelCostCents: true, flownAt: true, companyExpenses: { select: { id: true } } },
    orderBy: [{ flownAt: "desc" }, { createdAt: "desc" }],
    take: Math.max(1, Math.min(limit, 1000)),
  });

  for (const pirep of pireps) {
    result.scanned++;
    try {
      if (pirep.fuelCostCents === null && pirep.fuelUsed && pirep.fuelUsed > 0) {
        const snapshot = await calculateFuelCostSnapshot({ departure: pirep.departure, fuelUsedKg: pirep.fuelUsed, at: pirep.flownAt });
        if (snapshot.fuelCostCents !== null) {
          await prisma.pirep.update({ where: { id: pirep.id }, data: snapshot });
          result.fuelUpdated++;
        }
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
    } as Prisma.InputJsonValue,
  });

  return result;
}
