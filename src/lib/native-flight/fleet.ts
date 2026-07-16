import { prisma } from "@/lib/prisma";
import { normalizeCode } from "./normalize";
import type { NativeOrigin } from "./airport";

export const findFleetById = (id: string) => prisma.fleet.findUnique({ where: { id } });
export function createNativeFleet(input: {
  code: string; name: string; type: string; maxPassengers?: number | null;
  maxCargoKg?: number | null; dataOrigin?: NativeOrigin;
}) {
  return prisma.fleet.create({ data: {
    code: normalizeCode(input.code, "Fleet code"), name: input.name.trim(),
    type: input.type.trim().toUpperCase(), maxPassengers: input.maxPassengers ?? null,
    maxCargoKg: input.maxCargoKg ?? null, dataOrigin: input.dataOrigin ?? "HISPAFLY_NATIVE",
    syncStatus: "LOCAL_DRAFT",
  } });
}
