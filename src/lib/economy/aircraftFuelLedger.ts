import { prisma } from "@/lib/prisma";
import { calculateFuelCostSnapshot } from "./fuel";

export async function calculateAircraftFuelUplift(input: {
  vamsysAircraftId: string | null;
  currentPirepId?: string;
  flownAt: Date | null;
  departure: string | null;
  rampFuelKg: number | null;
  landingFuelKg: number | null;
}) {
  if (!input.vamsysAircraftId || input.rampFuelKg === null) return null;
  const previous = await prisma.pirep.findFirst({
    where: {
      vamsysAircraftId: input.vamsysAircraftId,
      landingFuelKg: { not: null },
      ...(input.currentPirepId ? { id: { not: input.currentPirepId } } : {}),
      ...(input.flownAt ? { flownAt: { lt: input.flownAt } } : {}),
    },
    orderBy: [{ flownAt: "desc" }, { createdAt: "desc" }],
    select: { landingFuelKg: true },
  });
  const inheritedFuelKg = previous?.landingFuelKg ?? 0;
  const fuelUpliftKg = Math.max(0, input.rampFuelKg - inheritedFuelKg);
  const cost = await calculateFuelCostSnapshot({ departure: input.departure, fuelUsedKg: fuelUpliftKg, at: input.flownAt });
  if (input.landingFuelKg !== null) {
    await prisma.aircraft.updateMany({
      where: { vamsysAircraftId: input.vamsysAircraftId },
      data: { fuelOnBoardKg: input.landingFuelKg, fuelReportedAt: input.flownAt ?? new Date() },
    });
  }
  return { inheritedFuelKg, fuelUpliftKg, ...cost };
}
