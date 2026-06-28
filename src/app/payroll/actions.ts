"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { calculatePayroll, creditsToCents } from "@/lib/payroll/calculatePayroll";
import { payrollRulesFromStoredRule } from "@/lib/payroll/rules";
import { requireStaffPermission } from "@/lib/staff/authorization";

function payrollId(formData: FormData) {
  const id = formData.get("payrollId");
  if (typeof id !== "string" || !id) throw new Error("Falta el identificador de la nómina.");
  return id;
}

function readableError(error: unknown) {
  return error instanceof Error ? error.message : "No se pudo completar la acción.";
}

async function runPayrollAction(
  formData: FormData,
  successMessage: string,
  action: (id: string) => Promise<void>,
) {
  let feedback: { type: "success" | "error"; message: string };
  try {
    await action(payrollId(formData));
    feedback = { type: "success", message: successMessage };
  } catch (error) {
    feedback = { type: "error", message: readableError(error) };
  }
  revalidatePath("/payroll");
  revalidatePath("/audit");
  revalidatePath("/");
  redirect(`/payroll?${feedback.type}=${encodeURIComponent(feedback.message)}`);
}

export async function approvePayroll(formData: FormData) {
  return runPayrollAction(formData, "Nómina aprobada correctamente.", async (id) => {
    const staff = await requireStaffPermission("PAYROLL_APPROVE", { entityType: "PayrollRecord", entityId: id, attemptedAction: `aprobar la nómina ${id}` });
    await prisma.$transaction(async (tx) => {
      const record = await tx.payrollRecord.findUnique({ where: { id }, include: { pilot: true } });
      if (!record) throw new Error("No se ha encontrado la nómina.");
      if (record.status !== "pending") throw new Error("Solo una nómina pendiente puede aprobarse.");
      const claimed = await tx.payrollRecord.updateMany({ where: { id, status: "pending" }, data: { status: "approved", approvedAt: new Date() } });
      if (claimed.count !== 1) throw new Error("La nómina cambió de estado antes de aprobarse.");
      await tx.aocAuditLog.create({ data: {
        staffUserId: staff.id, action: "PAYROLL_APPROVED", entityType: "PayrollRecord", entityId: id,
        message: `${staff.name} aprobó la nómina ${id} del piloto ${record.pilot.callsign ?? record.pilot.displayName}.`,
        metadata: { pilotId: record.pilotId, previousStatus: "pending", newStatus: "approved" },
      } });
    });
  });
}

export async function recalculatePayroll(formData: FormData) {
  return runPayrollAction(formData, "Nómina recalculada con las reglas activas.", async (id) => {
    const staff = await requireStaffPermission("PAYROLL_RECALCULATE", { entityType: "PayrollRecord", entityId: id, attemptedAction: `recalcular la nómina ${id}` });
    await prisma.$transaction(async (tx) => {
      const [record, activeRule] = await Promise.all([
        tx.payrollRecord.findUnique({ where: { id }, include: { pirep: true, pilot: true } }),
        tx.payrollRule.findFirst({ where: { isActive: true }, orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }] }),
      ]);
      if (!record) throw new Error("No se ha encontrado la nómina.");
      if (record.status !== "pending") throw new Error("Solo una nómina pendiente puede recalcularse.");
      if (record.pirep.status !== "accepted") throw new Error("Solo los PIREPs aceptados pueden generar nómina.");
      if (!activeRule) throw new Error("No hay ninguna regla de nómina activa.");

      const { aircraftType, flightTimeMinutes, network, landingRate, score } = record.pirep;
      if (!aircraftType || flightTimeMinutes === null || !network || landingRate === null || score === null) {
        throw new Error("El PIREP no contiene todos los datos necesarios para recalcular la nómina.");
      }
      const calculation = calculatePayroll({ aircraftType, flightTimeMinutes, network, landingRate, score, status: record.pirep.status }, payrollRulesFromStoredRule(activeRule));
      const amountCents = creditsToCents(calculation.finalAmount);
      const result = await tx.payrollRecord.updateMany({
        where: { id, status: "pending" },
        data: {
          payrollRuleId: activeRule.id,
          basePayCents: creditsToCents(calculation.basePay),
          bonusCents: creditsToCents(calculation.totalBonus),
          penaltyCents: creditsToCents(calculation.penalties),
          amountCents,
          calculationDetails: { ...calculation },
        },
      });
      if (result.count !== 1) throw new Error("La nómina cambió de estado antes del recálculo.");
      await tx.aocAuditLog.create({ data: {
        staffUserId: staff.id, action: "PAYROLL_RECALCULATED", entityType: "PayrollRecord", entityId: id,
        message: `${staff.name} recalculó la nómina ${id} del piloto ${record.pilot.callsign ?? record.pilot.displayName}.`,
        metadata: { payrollRuleId: activeRule.id, previousAmountCents: record.amountCents, amountCents },
      } });
    });
  });
}

export async function rejectPayroll(formData: FormData) {
  return runPayrollAction(formData, "Nómina rechazada.", async (id) => {
    const staff = await requireStaffPermission("PAYROLL_REJECT", { entityType: "PayrollRecord", entityId: id, attemptedAction: `rechazar la nómina ${id}` });
    await prisma.$transaction(async (tx) => {
      const record = await tx.payrollRecord.findUnique({ where: { id }, include: { pilot: true } });
      if (!record) throw new Error("No se ha encontrado la nómina.");
      if (record.status !== "pending") throw new Error("Solo una nómina pendiente puede rechazarse.");
      const claimed = await tx.payrollRecord.updateMany({ where: { id, status: "pending" }, data: { status: "rejected" } });
      if (claimed.count !== 1) throw new Error("La nómina cambió de estado antes de rechazarse.");
      await tx.aocAuditLog.create({ data: {
        staffUserId: staff.id, action: "PAYROLL_REJECTED", entityType: "PayrollRecord", entityId: id,
        message: `${staff.name} rechazó la nómina ${id} del piloto ${record.pilot.callsign ?? record.pilot.displayName}.`,
        metadata: { pilotId: record.pilotId, previousStatus: "pending", newStatus: "rejected" },
      } });
    });
  });
}

export async function markPayrollPaid(formData: FormData) {
  return runPayrollAction(formData, "Nómina pagada y movimiento de cartera creado.", async (id) => {
    const staff = await requireStaffPermission("PAYROLL_MARK_PAID", { entityType: "PayrollRecord", entityId: id, attemptedAction: `marcar como pagada la nómina ${id}` });
    await prisma.$transaction(async (tx) => {
      const record = await tx.payrollRecord.findUnique({ where: { id }, include: { pirep: true, pilot: true, walletTransaction: true } });
      if (!record) throw new Error("No se ha encontrado la nómina.");
      if (record.status !== "approved") throw new Error("Solo una nómina aprobada puede marcarse como pagada.");
      if (record.walletTransaction) throw new Error("Esta nómina ya tiene un movimiento de cartera asociado.");

      const claimed = await tx.payrollRecord.updateMany({ where: { id, status: "approved" }, data: { status: "paid", paidAt: new Date() } });
      if (claimed.count !== 1) throw new Error("La nómina ya fue pagada o cambió de estado.");
      const walletTransaction = await tx.walletTransaction.create({ data: {
        pilotId: record.pilotId, payrollRecordId: record.id, type: "payroll", amountCents: record.amountCents,
        description: `Nómina ${record.pirep.flightNumber}`, reference: record.pirep.vamsysPirepId,
      } });
      await tx.pilot.update({ where: { id: record.pilotId }, data: { walletBalanceCents: { increment: record.amountCents } } });
      await tx.aocAuditLog.createMany({ data: [
        {
          staffUserId: staff.id, action: "PAYROLL_MARKED_PAID", entityType: "PayrollRecord", entityId: id,
          message: `${staff.name} marcó como pagada la nómina ${id} del piloto ${record.pilot.callsign ?? record.pilot.displayName}.`,
          metadata: { pilotId: record.pilotId, amountCents: record.amountCents, walletTransactionId: walletTransaction.id },
        },
        {
          staffUserId: staff.id, action: "WALLET_TRANSACTION_CREATED", entityType: "WalletTransaction", entityId: walletTransaction.id,
          message: `${staff.name} creó el movimiento de cartera ${walletTransaction.id} por la nómina ${id}.`,
          metadata: { payrollRecordId: id, pilotId: record.pilotId, amountCents: record.amountCents },
        },
      ] });
    });
  });
}
