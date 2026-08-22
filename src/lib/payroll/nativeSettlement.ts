import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calculatePayroll, creditsToCents } from "./calculatePayroll";
import { payrollRulesFromStoredRule } from "./rules";

export type NativeSettlementResult =
  | { status: "created" | "existing"; payrollRecordId: string }
  | { status: "skipped"; reason: string };

/**
 * Idempotently settles a native accepted PIREP. The advisory lock and the
 * unique PIREP/payroll and payroll/wallet relations protect both the payroll
 * record and wallet balance from duplicate ACARS completion retries.
 */
export async function ensureNativePayrollSettlement(pirepId: string): Promise<NativeSettlementResult> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`native-payroll:${pirepId}`}))`;
    const pirep = await tx.pirep.findUnique({
      where: { id: pirepId },
      include: { payrollRecord: { include: { walletTransaction: true } } },
    });
    if (!pirep || pirep.status !== "accepted" || pirep.source !== "HISPAFLY_ACARS") {
      return { status: "skipped", reason: "PIREP is not an accepted native ACARS report." };
    }

    const effectiveNetwork = pirep.network?.trim().toUpperCase() || "OFFLINE";
    const effectivePassengers = pirep.passengers ?? 0;
    if (pirep.network !== effectiveNetwork || pirep.passengers !== effectivePassengers) {
      await tx.pirep.update({
        where: { id: pirep.id },
        data: { network: effectiveNetwork, passengers: effectivePassengers },
      });
    }

    let payroll = pirep.payrollRecord;
    let created = false;
    if (!payroll) {
      const rule = await tx.payrollRule.findFirst({
        where: { isActive: true },
        orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }],
      });
      if (!rule) return { status: "skipped", reason: "No active payroll rule." };
      if (!pirep.aircraftType || pirep.flightTimeMinutes === null || pirep.landingRate === null || pirep.score === null || !pirep.flownAt) {
        return { status: "skipped", reason: "PIREP is missing required payroll fields." };
      }
      const calculation = calculatePayroll({
        aircraftType: pirep.aircraftType,
        flightTimeMinutes: pirep.flightTimeMinutes,
        network: effectiveNetwork,
        landingRate: pirep.landingRate,
        score: pirep.score,
        status: pirep.status,
      }, payrollRulesFromStoredRule(rule));
      const now = new Date();
      payroll = await tx.payrollRecord.create({
        data: {
          pirepId: pirep.id,
          pilotId: pirep.pilotId,
          payrollRuleId: rule.id,
          basePayCents: creditsToCents(calculation.basePay),
          bonusCents: creditsToCents(calculation.totalBonus),
          penaltyCents: creditsToCents(calculation.penalties),
          amountCents: creditsToCents(calculation.finalAmount),
          calculationDetails: { ...calculation },
          status: "paid",
          settlementMonth: pirep.flownAt.toISOString().slice(0, 7),
          approvedAt: now,
          paidAt: now,
        },
        include: { walletTransaction: true },
      });
      created = true;
    }

    if (payroll.status === "rejected") {
      payroll = await tx.payrollRecord.update({
        where: { id: payroll.id },
        data: { status: "paid", approvedAt: new Date(), paidAt: new Date() },
        include: { walletTransaction: true },
      });
    }

    if (!payroll.walletTransaction && payroll.amountCents !== 0) {
      const wallet = await tx.walletTransaction.create({
        data: {
          pilotId: pirep.pilotId,
          payrollRecordId: payroll.id,
          type: "payroll",
          amountCents: payroll.amountCents,
          description: `Nómina automática${pirep.flightNumber ? ` ${pirep.flightNumber}` : ""}`,
          reference: pirep.id,
        },
      });
      await tx.pilot.update({
        where: { id: pirep.pilotId },
        data: { walletBalanceCents: { increment: payroll.amountCents } },
      });
      await tx.aocAuditLog.create({
        data: {
          action: "NATIVE_PAYROLL_SETTLED",
          entityType: "PayrollRecord",
          entityId: payroll.id,
          message: `Native ACARS payroll settled for ${pirep.flightNumber ?? pirep.id}.`,
          metadata: { pirepId: pirep.id, pilotId: pirep.pilotId, amountCents: payroll.amountCents, walletTransactionId: wallet.id, network: effectiveNetwork } as Prisma.InputJsonValue,
        },
      });
    }
    return { status: created ? "created" : "existing", payrollRecordId: payroll.id };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
