import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export interface AuditEvent {
  action: string;
  entityType: string;
  entityId?: string | null;
  staffUserId?: string | null;
  message: string;
  metadata?: Prisma.InputJsonValue;
}

export async function writeAuditLog(event: AuditEvent) {
  return prisma.aocAuditLog.create({ data: {
    staffUserId: event.staffUserId ?? null,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    message: event.message,
    metadata: event.metadata,
  } });
}

export async function writeAuditLogSafely(event: AuditEvent) {
  try {
    await writeAuditLog(event);
  } catch (error) {
    console.error("Unable to persist AOC audit event.", error);
  }
}
