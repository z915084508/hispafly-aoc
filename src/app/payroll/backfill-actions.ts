"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calculatePayroll, creditsToCents } from "@/lib/payroll/calculatePayroll";
import { payrollRulesFromStoredRule } from "@/lib/payroll/rules";
import type { PayrollPirepInput } from "@/lib/payroll/types";
import { requireStaffPermission } from "@/lib/staff/authorization";

function msg(error: unknown) { return error instanceof Error ? error.message : "No se pudo completar la accion."; }
function revalidatePayrollViews() { revalidatePath("/payroll"); revalidatePath("/staff/payroll"); revalidatePath("/audit"); revalidatePath("/staff/audit"); revalidatePath("/staff"); }

function inputFromPirep(pirep: { aircraftType: string | null; flightTimeMinutes: number | null; network: string | null; landingRate: number | null; score: number | null; status?: string | null; }): PayrollPirepInput {
  if (!pirep.aircraftType || pirep.flightTimeMinutes === null || !pirep.network || pirep.landingRate === null || pirep.score === null) throw new Error("PIREP without required payroll fields.");
  return { aircraftType: pirep.aircraftType, flightTimeMinutes: pirep.flightTimeMinutes, network: pirep.network, landingRate: pirep.landingRate, score: pirep.score, status: pirep.status };
}

export async function generateMissingPayroll() {
  let feedback: { type: "success" | "error"; message: string };
  try {
    const staff = await requireStaffPermission("PAYROLL_RECALCULATE", { entityType: "PayrollRecord", entityId: "backfill", attemptedAction: "generate missing payroll" });
    const activeRule = await prisma.payrollRule.findFirst({ where: { isActive: true }, orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }] });
    if (!activeRule) throw new Error("No active payroll rule found.");
    const candidates = await prisma.pirep.findMany({ where: { status: "accepted" }, include: { payrollRecord: true, pilot: true }, orderBy: { flownAt: "desc" }, take: 1000 });
    let created = 0;
    let skipped = 0;
    const errors: string[] = [];
    for (const pirep of candidates) {
      if (pirep.payrollRecord) continue;
      if (!pirep.flownAt) { skipped++; continue; }
      try {
        const calculation = calculatePayroll(inputFromPirep(pirep), payrollRulesFromStoredRule(activeRule));
        await prisma.payrollRecord.create({ data: { pirepId: pirep.id, pilotId: pirep.pilotId, payrollRuleId: activeRule.id, basePayCents: creditsToCents(calculation.basePay), bonusCents: creditsToCents(calculation.totalBonus), penaltyCents: creditsToCents(calculation.penalties), amountCents: creditsToCents(calculation.finalAmount), calculationDetails: { ...calculation }, settlementMonth: pirep.flownAt.toISOString().slice(0, 7) } });
        created++;
      } catch (error) {
        skipped++;
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) errors.push(`${pirep.flightNumber ?? pirep.vamsysPirepId}: ${msg(error)}`);
      }
    }
    await prisma.aocAuditLog.create({ data: { staffUserId: staff.id, action: "PAYROLL_BACKFILL_GENERATED", entityType: "PayrollRecord", message: `${staff.name} generated ${created} missing payroll records from accepted PIREPs.`, metadata: { created, skipped, errors: errors.slice(0, 10) } } });
    feedback = { type: "success", message: `Se generaron ${created} nominas faltantes. Omitidas: ${skipped}.` };
  } catch (error) { feedback = { type: "error", message: msg(error) }; }
  revalidatePayrollViews();
  redirect(`/staff/payroll?${feedback.type}=${encodeURIComponent(feedback.message)}`);
}
