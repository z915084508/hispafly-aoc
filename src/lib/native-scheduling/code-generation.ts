import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ScheduleManagementError } from "./management-rules";

type DbClient = Prisma.TransactionClient | typeof prisma;

const normalizeBase = (value: unknown) => String(value ?? "")
  .trim()
  .toUpperCase()
  .replace(/[^A-Z0-9_-]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 58);

export async function generateAvailableScheduleCode(input: {
  routeId: string;
  preferredCode?: unknown;
  excludeScheduleId?: string;
  db?: DbClient;
}) {
  const db = input.db ?? prisma;
  const route = await db.route.findUnique({
    where: { id: input.routeId },
    select: { routeCode: true },
  });
  if (!route) throw new ScheduleManagementError("ROUTE_NOT_FOUND", "La ruta seleccionada no existe.");

  const base = normalizeBase(input.preferredCode) || normalizeBase(route.routeCode);
  if (!base) throw new ScheduleManagementError("CODE_GENERATION_FAILED", "No se pudo generar un código para esta programación.");

  const existing = await db.flightSchedule.findMany({
    where: {
      id: input.excludeScheduleId ? { not: input.excludeScheduleId } : undefined,
      OR: [{ code: base }, { code: { startsWith: `${base}-` } }],
    },
    select: { code: true },
    take: 500,
  });
  const used = new Set(existing.map(({ code }) => code.toUpperCase()));
  if (!used.has(base)) return base;

  for (let index = 2; index <= 999; index += 1) {
    const candidate = `${base}-${String(index).padStart(2, "0")}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new ScheduleManagementError("CODE_GENERATION_EXHAUSTED", `No quedan códigos disponibles para ${base}.`);
}
