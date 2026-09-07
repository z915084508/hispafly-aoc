import { prisma } from "@/lib/prisma";
import { buildPilotPerformanceTrend } from "@/lib/pilot-evaluation/trend";
import { deriveTrendRiskSignals } from "./trend-signals";
import { recordPilotRiskSignal } from "./repository";

export async function refreshTrendRiskSignalsForPilot(pilotId: string): Promise<number> {
  const periods = await prisma.pilotEvaluationPeriod.findMany({
    where: { pilotId, windowType: "LAST_10_FLIGHTS" },
    orderBy: { calculatedAt: "desc" },
    take: 2,
    select: {
      calculatedAt: true,
      overallScore: true,
      safetyScore: true,
      sopScore: true,
      operationsScore: true,
      reliabilityScore: true,
      commandReadinessScore: true,
    },
  });
  const signals = deriveTrendRiskSignals(pilotId, buildPilotPerformanceTrend(periods));
  for (const signal of signals) await recordPilotRiskSignal(signal);
  return signals.length;
}

export async function refreshTrendRiskSignalsForActivePilots(): Promise<{ pilots: number; signals: number }> {
  const pilots = await prisma.pilot.findMany({ where: { status: "active" }, select: { id: true } });
  let signals = 0;
  for (const pilot of pilots) signals += await refreshTrendRiskSignalsForPilot(pilot.id);
  return { pilots: pilots.length, signals };
}
