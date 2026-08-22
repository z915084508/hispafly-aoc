import { prisma } from "@/lib/prisma";

export async function getStaffPirepDetail(id: string) {
  return prisma.pirep.findFirst({
    where: { id },
    include: {
      pilot: { select: { displayName: true, callsign: true, vamsysPilotId: true } },
      companyExpenses: { orderBy: { type: "asc" } },
      payrollRecord: { include: { walletTransaction: true } },
      flightAnalysisReport: true,
      acarsSession: {
        include: {
          positions: { orderBy: { recordedAt: "asc" }, take: 20 },
          events: { orderBy: { recordedAt: "asc" }, take: 50 },
        },
      },
      reviewHistory: { orderBy: { createdAt: "desc" } },
      operationalEvents: { orderBy: { timestamp: "asc" } },
    },
  });
}
