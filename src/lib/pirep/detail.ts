import { prisma } from "@/lib/prisma";

export async function getStaffPirepDetail(id: string) {
  return prisma.pirep.findFirst({
    where: { id, status: "accepted" },
    include: {
      pilot: { select: { displayName: true, callsign: true, vamsysPilotId: true } },
      companyExpenses: { orderBy: { type: "asc" } },
      payrollRecord: { include: { walletTransaction: true } },
      flightAnalysisReport: true,
    },
  });
}
