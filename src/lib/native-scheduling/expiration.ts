import { prisma } from "@/lib/prisma";
import type { StaffIdentity } from "@/lib/staff/identity";

const DAY = 86_400_000;
const MANAGEABLE_STATUSES = ["ACTIVE", "SUSPENDED", "EXPIRED"] as const;

function utcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export type ExpiringScheduleRow = {
  id: string;
  code: string;
  status: string;
  daysOfWeek: number[];
  departureTimeMinutesUtc: number;
  arrivalTimeMinutesUtc: number;
  effectiveFrom: Date;
  effectiveUntil: Date;
  daysRemaining: number;
  generationHorizonDays: number;
  route: {
    flightNumber: string | null;
    departure: string;
    arrival: string;
  };
  defaultFleet: { code: string | null; name: string } | null;
  assignedAircraft: { registration: string | null } | null;
};

export async function listExpiringSchedules(input: {
  horizonDays?: number;
  recentExpiredDays?: number;
  now?: Date;
} = {}): Promise<ExpiringScheduleRow[]> {
  const now = input.now ?? new Date();
  const today = utcDay(now);
  const horizonDays = Math.min(365, Math.max(1, input.horizonDays ?? 60));
  const recentExpiredDays = Math.min(365, Math.max(0, input.recentExpiredDays ?? 30));
  const from = new Date(today.getTime() - recentExpiredDays * DAY);
  const until = new Date(today.getTime() + horizonDays * DAY);

  const rows = await prisma.flightSchedule.findMany({
    where: {
      status: { in: [...MANAGEABLE_STATUSES] },
      effectiveUntil: { not: null, gte: from, lte: until },
    },
    select: {
      id: true,
      code: true,
      status: true,
      daysOfWeek: true,
      departureTimeMinutesUtc: true,
      arrivalTimeMinutesUtc: true,
      effectiveFrom: true,
      effectiveUntil: true,
      generationHorizonDays: true,
      route: { select: { flightNumber: true, departure: true, arrival: true } },
      defaultFleet: { select: { code: true, name: true } },
      assignedAircraft: { select: { registration: true } },
    },
    orderBy: [{ effectiveUntil: "asc" }, { code: "asc" }],
  });

  return rows.flatMap((row) => row.effectiveUntil ? [{
    ...row,
    effectiveUntil: row.effectiveUntil,
    daysRemaining: Math.floor((utcDay(row.effectiveUntil).getTime() - today.getTime()) / DAY),
  }] : []);
}

export async function renewFlightScheduleExpiry(input: {
  scheduleId: string;
  actor: StaffIdentity;
  mode: "EXTEND" | "NO_EXPIRY";
  extendDays?: number;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const current = await prisma.flightSchedule.findUnique({
    where: { id: input.scheduleId },
    select: { id: true, code: true, status: true, effectiveUntil: true },
  });
  if (!current) throw new Error("Programación no encontrada.");
  if (!MANAGEABLE_STATUSES.includes(current.status as typeof MANAGEABLE_STATUSES[number])) {
    throw new Error(`No se puede renovar una programación en estado ${current.status}.`);
  }

  let nextUntil: Date | null = null;
  if (input.mode === "EXTEND") {
    const extendDays = Number(input.extendDays ?? 0);
    if (![30, 90, 180, 365].includes(extendDays)) throw new Error("Periodo de renovación no válido.");
    const today = utcDay(now);
    const currentUntil = current.effectiveUntil ? utcDay(current.effectiveUntil) : today;
    const base = currentUntil > today ? currentUntil : today;
    nextUntil = new Date(base.getTime() + extendDays * DAY);
  }

  const nextStatus = current.status === "EXPIRED" ? "ACTIVE" : current.status;
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.flightSchedule.update({
      where: { id: current.id },
      data: { effectiveUntil: nextUntil, status: nextStatus, archivedAt: null },
      select: { id: true, code: true, status: true, effectiveUntil: true },
    });
    await tx.staffAuditLog.create({ data: {
      staffId: input.actor.id,
      action: "SCHEDULE_RENEWED",
      targetType: "FlightSchedule",
      targetId: current.id,
      before: { status: current.status, effectiveUntil: current.effectiveUntil?.toISOString() ?? null },
      after: { status: row.status, effectiveUntil: row.effectiveUntil?.toISOString() ?? null, mode: input.mode, extendDays: input.extendDays ?? null },
    } });
    return row;
  });

  return updated;
}
