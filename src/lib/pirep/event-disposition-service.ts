import { Prisma, type PrismaClient } from "@prisma/client";
import { dispositionScore } from "./event-disposition.ts";
import { finite, object, loadScoringPolicy } from "./scoring.ts";
// Callers must authorize PIREP_SCORE before invoking this transaction.
export async function applyEventDisposition(db: PrismaClient, input: { pirepId: string; eventId: string; status: string; reason: string; staff: { id: string; name: string } }) {
  const { pirepId, eventId, status, staff } = input;
  const reason = input.reason.trim();
  if (!reason || reason.length > 2000) throw new Error("An audit reason of 1–2000 characters is required.");
  await db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pirep-score:${pirepId}`}))`;
    const pirep = await tx.pirep.findUnique({ where: { id: pirepId }, include: { operationalEvents: true, flightDispatch: { include: { flight: true } } } });
    if (!pirep) throw new Error("PIREP not found.");
    const event = pirep.operationalEvents.find(e => e.id === eventId);
    if (!event) throw new Error("Operational event not found in this PIREP.");
    const policy = await loadScoringPolicy(tx, pirep.flightDispatch?.flight?.fleetId);
    const efficiency = finite(object(pirep.scoringDetails).efficiencyScore);
    const scoring = dispositionScore(policy, pirep.operationalEvents, eventId, status, efficiency, { landingG: pirep.landingG, landingRate: pirep.landingRate });
    await tx.operationalEvent.update({ where: { id: event.id }, data: { status, dispositionReason: reason, reviewedById: staff.id, reviewedByName: staff.name, reviewedAt: new Date() } });
    const applied = (scoring.details as { appliedRules: Array<{ eventId: string | null; impact: number; requiresReview: boolean }> }).appliedRules;
    // Reapply caps to all events: dismissing one light event can free capacity for another.
    for (const rule of applied) if (rule.eventId) await tx.operationalEvent.update({ where: { id: rule.eventId }, data: { scoreImpact: rule.impact, requiresReview: rule.requiresReview } });
    await tx.pirep.update({ where: { id: pirepId }, data: { score: scoring.totalScore, points: scoring.totalScore, scoringDetails: scoring.details } });
    await tx.aocAuditLog.create({ data: { staffUserId: staff.id === "development-staff" ? null : staff.id, action: "FOQA_EVENT_DISPOSITION", entityType: "OperationalEvent", entityId: eventId,
      message: `${staff.name}: ${event.eventType} ${event.status} → ${status}: ${reason}`,
      metadata: { pirepId, reason, reviewer: staff.name, before: { status: event.status, impact: event.scoreImpact, originalImpact: event.originalImpact, finalScore: pirep.score }, after: { status, finalScore: scoring.totalScore }, evidenceRetained: true } } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
