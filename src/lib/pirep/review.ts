import { Prisma, type PirepRejectCode, type PirepStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deliverAmnPirep } from "@/lib/amn/pirep-delivery";
import { ensureNativePayrollSettlement } from "@/lib/payroll/nativeSettlement";
import { syncPilotAutomaticRank } from "@/lib/pilot/career-service";
import { PIREP_REJECT_REASONS } from "./policy";

type Reviewer = { id?: string | null; name: string; automatic?: boolean };
type ReviewInput = { pirepId: string; toStatus: Extract<PirepStatus, "manual_review" | "accepted" | "rejected">; rejectCode?: PirepRejectCode | null; staffComment?: string | null; reviewer: Reviewer };

export async function reviewPirep(input: ReviewInput) {
  const comment = input.staffComment?.trim() || null;
  if (input.toStatus === "rejected" && !input.rejectCode) throw new Error("Reject code R01-R08 is required.");
  if (input.toStatus === "rejected" && input.rejectCode === "R08" && !comment) throw new Error("Staff Comment is required for R08 / Other circumstances.");

  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pirep-review:${input.pirepId}`}))`;
    const pirep = await tx.pirep.findUnique({ where: { id: input.pirepId }, include: { payrollRecord: { include: { walletTransaction: true } } } });
    if (!pirep) throw new Error("PIREP not found.");
    const now = new Date();
    const acceptedAfterReview = input.toStatus === "accepted" && pirep.status === "rejected";
    let reversedWalletCents = 0;
    if (input.toStatus !== "accepted" && pirep.payrollRecord?.walletTransaction) {
      reversedWalletCents = pirep.payrollRecord.walletTransaction.amountCents;
      await tx.walletTransaction.delete({ where: { id: pirep.payrollRecord.walletTransaction.id } });
      await tx.pilot.update({ where: { id: pirep.pilotId }, data: { walletBalanceCents: { decrement: reversedWalletCents } } });
      await tx.payrollRecord.update({ where: { id: pirep.payrollRecord.id }, data: { status: "rejected", paidAt: null } });
    }
    if (input.toStatus !== "accepted" && pirep.payrollRecord && !pirep.payrollRecord.walletTransaction) {
      await tx.payrollRecord.update({ where: { id: pirep.payrollRecord.id }, data: { status: "rejected", paidAt: null } });
    }
    const impact = { flightHoursCredited: input.toStatus === "accepted", walletRewardCredited: input.toStatus === "accepted", rankProgressCredited: input.toStatus === "accepted", reversedWalletCents };
    const updated = await tx.pirep.update({
      where: { id: pirep.id },
      data: {
        status: input.toStatus,
        rejectCode: input.toStatus === "rejected" ? input.rejectCode : null,
        staffComment: comment,
        reviewedByStaffId: input.reviewer.id ?? null,
        reviewedByName: input.reviewer.name,
        reviewedAt: now,
        rejectedAt: input.toStatus === "rejected" ? now : pirep.rejectedAt,
        acceptedAt: input.toStatus === "accepted" ? now : pirep.acceptedAt,
        acceptedAfterReviewAt: acceptedAfterReview ? now : pirep.acceptedAfterReviewAt,
        reviewSettlementState: impact,
      },
    });
    await tx.pirepReview.create({ data: { pirepId: pirep.id, fromStatus: pirep.status, toStatus: input.toStatus, rejectCode: input.toStatus === "rejected" ? input.rejectCode : null, staffComment: comment, reviewerStaffId: input.reviewer.id ?? null, reviewerName: input.reviewer.name, automatic: input.reviewer.automatic ?? false, impact } });
    await tx.aocAuditLog.create({ data: { staffUserId: input.reviewer.id ?? null, action: `PIREP_${input.toStatus.toUpperCase()}`, entityType: "Pirep", entityId: pirep.id, message: `${input.reviewer.name} changed PIREP ${pirep.flightNumber ?? pirep.id} from ${pirep.status} to ${input.toStatus}.`, metadata: { rejectCode: input.rejectCode ?? null, rejectReason: input.rejectCode ? PIREP_REJECT_REASONS[input.rejectCode] : null, staffComment: comment, acceptedAfterReview, impact } as Prisma.InputJsonValue } });
    return { updated, acceptedAfterReview, impact };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (result.updated.status === "accepted") await ensureNativePayrollSettlement(result.updated.id);
  await syncPilotAutomaticRank(result.updated.pilotId);
  if (result.updated.status === "accepted") await deliverAmnPirep(result.updated.id).catch(() => undefined);
  return result;
}
