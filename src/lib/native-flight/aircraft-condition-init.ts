import { prisma } from "@/lib/prisma";

export async function ensureNativeAircraftCondition(aircraftId: string) {
  const aircraft = await prisma.aircraft.findUnique({
    where: { id: aircraftId },
    select: {
      id: true,
      registration: true,
      aircraftType: true,
      vamsysAircraftId: true,
      dataOrigin: true,
    },
  });
  if (!aircraft) throw new Error("Aircraft not found while initializing condition.");
  if (aircraft.dataOrigin === "VAMSYS_LEGACY") return null;

  return prisma.aircraftConditionSnapshot.upsert({
    where: { aircraftId: aircraft.id },
    create: {
      aircraftId: aircraft.id,
      vamsysAircraftId: aircraft.vamsysAircraftId ?? `native:${aircraft.id}`,
      registration: aircraft.registration,
      aircraftType: aircraft.aircraftType,
      conditionPercent: 100,
      operationalStatus: "NORMAL",
      maintenanceStatus: "NONE",
      maintenanceBaseIcao: "LEVC",
      cyclesSinceMaintenance: 0,
      blockMinutesSinceMaintenance: 0,
    },
    update: {
      registration: aircraft.registration,
      aircraftType: aircraft.aircraftType,
    },
  });
}
