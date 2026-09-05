import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { PilotRiskFlagRecord, PilotRiskSignalInput, PilotRiskStatus } from "./types";

export async function recordPilotRiskSignal(input: PilotRiskSignalInput): Promise<void> {
  const now = input.detectedAt ?? new Date();
  await prisma.$executeRaw`
    INSERT INTO "PilotRiskFlag" (
      "id", "pilotId", "source", "category", "severity", "status", "signalKey", "title", "reason", "evidence",
      "detectedAt", "lastDetectedAt", "occurrenceCount", "createdAt", "updatedAt"
    ) VALUES (
      ${randomUUID()}, ${input.pilotId}, ${input.source}, ${input.category}, ${input.severity}, 'OPEN', ${input.signalKey}, ${input.title}, ${input.reason},
      ${JSON.stringify(input.evidence ?? {})}::jsonb, ${now}, ${now}, 1, ${now}, ${now}
    )
    ON CONFLICT ("pilotId", "signalKey") WHERE "status" IN ('OPEN', 'CONFIRMED')
    DO UPDATE SET
      "severity" = EXCLUDED."severity",
      "title" = EXCLUDED."title",
      "reason" = EXCLUDED."reason",
      "evidence" = EXCLUDED."evidence",
      "lastDetectedAt" = EXCLUDED."lastDetectedAt",
      "occurrenceCount" = "PilotRiskFlag"."occurrenceCount" + 1,
      "updatedAt" = EXCLUDED."updatedAt"
  `;
}

export async function listActivePilotRiskFlags(pilotId?: string): Promise<PilotRiskFlagRecord[]> {
  if (pilotId) {
    return prisma.$queryRaw<PilotRiskFlagRecord[]>`
      SELECT * FROM "PilotRiskFlag"
      WHERE "pilotId" = ${pilotId} AND "status" IN ('OPEN', 'CONFIRMED')
      ORDER BY CASE "severity" WHEN 'CRITICAL' THEN 4 WHEN 'HIGH' THEN 3 WHEN 'MODERATE' THEN 2 ELSE 1 END DESC, "lastDetectedAt" DESC
    `;
  }
  return prisma.$queryRaw<PilotRiskFlagRecord[]>`
    SELECT * FROM "PilotRiskFlag"
    WHERE "status" IN ('OPEN', 'CONFIRMED')
    ORDER BY CASE "severity" WHEN 'CRITICAL' THEN 4 WHEN 'HIGH' THEN 3 WHEN 'MODERATE' THEN 2 ELSE 1 END DESC, "lastDetectedAt" DESC
  `;
}

export async function setPilotRiskFlagStatus(args: {
  id: string;
  status: Exclude<PilotRiskStatus, "OPEN">;
  staffId: string;
  comment?: string;
}): Promise<void> {
  const now = new Date();
  if (args.status === "CONFIRMED") {
    await prisma.$executeRaw`UPDATE "PilotRiskFlag" SET "status"='CONFIRMED', "confirmedAt"=${now}, "confirmedByStaffId"=${args.staffId}, "updatedAt"=${now} WHERE "id"=${args.id} AND "status"='OPEN'`;
    return;
  }
  if (args.status === "DISMISSED") {
    await prisma.$executeRaw`UPDATE "PilotRiskFlag" SET "status"='DISMISSED', "dismissedAt"=${now}, "dismissedByStaffId"=${args.staffId}, "resolutionComment"=${args.comment ?? null}, "updatedAt"=${now} WHERE "id"=${args.id} AND "status" IN ('OPEN','CONFIRMED')`;
    return;
  }
  await prisma.$executeRaw`UPDATE "PilotRiskFlag" SET "status"='RESOLVED', "resolvedAt"=${now}, "resolvedByStaffId"=${args.staffId}, "resolutionComment"=${args.comment ?? null}, "updatedAt"=${now} WHERE "id"=${args.id} AND "status" IN ('OPEN','CONFIRMED')`;
}
