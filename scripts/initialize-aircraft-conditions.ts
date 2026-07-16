import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const result = { created: 0, existing: 0, skipped: 0, errors: [] as string[] };
try {
  const [aircraft, locations, conditions] = await Promise.all([
    prisma.aircraft.findMany({
      select: {
        vamsysAircraftId: true,
        registration: true,
        aircraftType: true,
      },
    }),
    prisma.aircraftLocationSnapshot.findMany({
      select: {
        vamsysAircraftId: true,
        registration: true,
        aircraftType: true,
      },
    }),
    prisma.aircraftConditionSnapshot.findMany({
      select: { vamsysAircraftId: true },
    }),
  ]);
  const known = new Set(conditions.map((x) => x.vamsysAircraftId));
  const inventory = new Map<
    string,
    {
      vamsysAircraftId: string;
      registration: string | null;
      aircraftType: string | null;
    }
  >();
  for (const row of locations) inventory.set(row.vamsysAircraftId, row);
  for (const row of aircraft) {
    if (!row.vamsysAircraftId) {
      result.skipped++;
      continue;
    }
    const fallback = inventory.get(row.vamsysAircraftId);
    inventory.set(row.vamsysAircraftId, {
      vamsysAircraftId: row.vamsysAircraftId,
      registration: row.registration ?? fallback?.registration ?? null,
      aircraftType: row.aircraftType ?? fallback?.aircraftType ?? null,
    });
  }
  for (const row of inventory.values()) {
    if (known.has(row.vamsysAircraftId)) {
      result.existing++;
      continue;
    }
    try {
      await prisma.aircraftConditionSnapshot.create({
        data: {
          ...row,
          conditionPercent: 100,
          operationalStatus: "NORMAL",
          maintenanceStatus: "NONE",
          maintenanceBaseIcao: "LEVC",
          cyclesSinceMaintenance: 0,
          blockMinutesSinceMaintenance: 0,
        },
      });
      known.add(row.vamsysAircraftId);
      result.created++;
      await prisma.aocAuditLog.create({
        data: {
          action: "AIRCRAFT_CONDITION_CREATED_FROM_INVENTORY",
          entityType: "AircraftConditionSnapshot",
          message: `Condition initialized for ${row.registration ?? row.vamsysAircraftId}.`,
          metadata: { vamsysAircraftId: row.vamsysAircraftId },
        },
      });
    } catch (error) {
      result.errors.push(
        `${row.vamsysAircraftId}: ${error instanceof Error ? error.message : "unknown"}`,
      );
    }
  }
  await prisma.aocAuditLog.create({
    data: {
      action: "AIRCRAFT_CONDITION_INITIALIZE_COMPLETED",
      entityType: "AircraftConditionSnapshot",
      message: `Inventory initialization created ${result.created}; ${result.existing} existed.`,
      metadata: {
        created: result.created,
        existing: result.existing,
        skipped: result.skipped,
        errors: result.errors.length,
      },
    },
  });
  console.log(JSON.stringify(result));
} finally {
  await prisma.$disconnect();
}
