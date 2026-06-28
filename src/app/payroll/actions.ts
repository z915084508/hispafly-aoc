"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { calculatePayroll, creditsToCents } from "@/lib/payroll/calculatePayroll";
import { payrollRulesFromStoredRule } from "@/lib/payroll/rules";

const MOCK_STAFF_EMAIL = "operations@hispafly.test";

async function staffId() {
  const staff = await prisma.staffUser.findUnique({ where: { email: MOCK_STAFF_EMAIL }, select: { id: true } });
  if (!staff) throw new Error("Run the Prisma seed before using payroll actions.");
  return staff.id;
}

function payrollId(formData: FormData) {
  const id = formData.get("payrollId");
  if (typeof id !== "string" || !id) throw new Error("Missing payroll record ID.");
  return id;
}

export async function approvePayroll(formData: FormData) {
  const id = payrollId(formData);
  const actorId = await staffId();
  await prisma.$transaction(async (tx) => {
    const result = await tx.payrollRecord.updateMany({ where: { id, status: "pending" }, data: { status: "approved", approvedAt: new Date() } });
    if (result.count !== 1) throw new Error("Only pending payroll records can be approved.");
    await tx.aocAuditLog.create({ data: { staffUserId: actorId, action: "payroll_approved", entityType: "PayrollRecord", entityId: id } });
  });
  revalidatePath("/payroll"); revalidatePath("/");
}

export async function recalculatePayroll(formData: FormData) {
  const id = payrollId(formData);
  const actorId = await staffId();
  await prisma.$transaction(async (tx) => {
    const [record, activeRule] = await Promise.all([
      tx.payrollRecord.findUnique({ where: { id }, include: { pirep: true } }),
      tx.payrollRule.findFirst({ where: { isActive: true }, orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }] }),
    ]);
    if (!record || record.status !== "pending") throw new Error("Only pending payroll records can be recalculated.");
    if (record.pirep.status !== "accepted") throw new Error("Payroll can only be calculated for accepted PIREPs.");
    if (!activeRule) throw new Error("No active payroll rule is configured.");

    const calculation = calculatePayroll(record.pirep, payrollRulesFromStoredRule(activeRule));
    const result = await tx.payrollRecord.updateMany({
      where: { id, status: "pending" },
      data: {
        payrollRuleId: activeRule.id,
        basePayCents: creditsToCents(calculation.basePay),
        bonusCents: creditsToCents(calculation.totalBonus),
        penaltyCents: creditsToCents(calculation.penalties),
        amountCents: creditsToCents(calculation.finalAmount),
        calculationDetails: { ...calculation },
      },
    });
    if (result.count !== 1) throw new Error("Payroll status changed before recalculation completed.");
    await tx.aocAuditLog.create({
      data: { staffUserId: actorId, action: "payroll_recalculated", entityType: "PayrollRecord", entityId: id, details: { payrollRuleId: activeRule.id, amountCents: creditsToCents(calculation.finalAmount) } },
    });
  });
  revalidatePath("/payroll"); revalidatePath("/");
}

export async function rejectPayroll(formData: FormData) {
  const id = payrollId(formData);
  const actorId = await staffId();
  await prisma.$transaction(async (tx) => {
    const result = await tx.payrollRecord.updateMany({ where: { id, status: { in: ["pending", "approved"] } }, data: { status: "rejected" } });
    if (result.count !== 1) throw new Error("Paid or previously rejected payroll cannot be rejected.");
    await tx.aocAuditLog.create({ data: { staffUserId: actorId, action: "payroll_rejected", entityType: "PayrollRecord", entityId: id } });
  });
  revalidatePath("/payroll"); revalidatePath("/");
}

export async function markPayrollPaid(formData: FormData) {
  const id = payrollId(formData);
  const actorId = await staffId();
  await prisma.$transaction(async (tx) => {
    const record = await tx.payrollRecord.findUnique({ where: { id }, include: { pirep: true } });
    if (!record || record.status !== "approved") throw new Error("Only approved payroll can be paid.");
    const claimed = await tx.payrollRecord.updateMany({ where: { id, status: "approved" }, data: { status: "paid", paidAt: new Date() } });
    if (claimed.count !== 1) throw new Error("This payroll record has already been paid.");
    await tx.walletTransaction.create({ data: { pilotId: record.pilotId, payrollRecordId: record.id, type: "payroll", amountCents: record.amountCents, description: `N贸mina ${record.pirep.flightNumber}`, reference: record.pirep.vamsysPirepId } });
    await tx.pilot.update({ where: { id: record.pilotId }, data: { walletBalanceCents: { increment: record.amountCents } } });
    await tx.aocAuditLog.create({ data: { staffUserId: actorId, action: "payroll_marked_paid", entityType: "PayrollRecord", entityId: id, details: { amountCents: record.amountCents } } });
  });
  revalidatePath("/payroll"); revalidatePath("/wallet"); revalidatePath("/");
}
