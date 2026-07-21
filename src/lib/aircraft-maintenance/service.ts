import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLogSafely } from "@/lib/audit/log";
import {
  calculateAircraftWear,
  calculateMaintenanceCost,
  statusForCondition,
} from "./condition";
type PirepInput = {
  id: string;
  vamsysPirepId: string | null;
  vamsysAircraftId: string | null;
  aircraftRegistration: string | null;
  aircraftType: string | null;
  status: string;
  blockTimeMinutes: number | null;
  landingRate: number | null;
  points: number | null;
  rawData: unknown;
};
const deepNumber = (root: unknown, keys: string[]) => {
  const q = [root];
  while (q.length) {
    const v = q.shift();
    if (!v || typeof v !== "object") continue;
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (keys.includes(k.toLowerCase())) {
        const n = Number(x);
        if (Number.isFinite(n)) return n;
      }
      if (x && typeof x === "object") q.push(x);
    }
  }
  return null;
};
export async function applyAircraftWearFromAcceptedPirep(p: PirepInput) {
  if (p.status !== "accepted" || !p.vamsysAircraftId) return { applied: false };
  try {
    return await prisma.$transaction(
      async (tx) => {
        const exists = await tx.aircraftWearEvent.findUnique({
          where: { localPirepId: p.id },
        });
        if (exists) return { applied: false, event: exists };
        const current = await tx.aircraftConditionSnapshot.upsert({
          where: { vamsysAircraftId: p.vamsysAircraftId! },
          create: {
            vamsysAircraftId: p.vamsysAircraftId!,
            registration: p.aircraftRegistration,
            aircraftType: p.aircraftType,
          },
          update: {
            registration: p.aircraftRegistration,
            aircraftType: p.aircraftType,
          },
        });
        const previous = Number(current.conditionPercent),
          landingG = deepNumber(p.rawData, [
            "landing_g",
            "landingg",
            "g_force",
            "gforce",
          ]);
        const wear = calculateAircraftWear({
          aircraftType: p.aircraftType,
          blockMinutes: p.blockTimeMinutes,
          landingRate: p.landingRate,
          landingG,
          pirepStatus: p.status,
          points: p.points,
        });
        const next = Math.max(
            0,
            Math.round((previous - wear.wearPercent) * 100) / 100,
          ),
          operationalStatus = statusForCondition(next),
          maintenanceStatus =
            next < 30 ? "REQUIRED" : current.maintenanceStatus;
        const event = await tx.aircraftWearEvent.create({
          data: {
            vamsysAircraftId: p.vamsysAircraftId!,
            localPirepId: p.id,
            vamsysPirepId: p.vamsysPirepId,
            previousCondition: previous,
            wearPercent: wear.wearPercent,
            newCondition: next,
            blockMinutes: p.blockTimeMinutes,
            landingRate: p.landingRate,
            landingG,
            aircraftType: p.aircraftType,
            factors: wear.factors,
          },
        });
        await tx.aircraftConditionSnapshot.update({
          where: { id: current.id },
          data: {
            conditionPercent: next,
            operationalStatus,
            maintenanceStatus,
            cyclesSinceMaintenance: { increment: 1 },
            blockMinutesSinceMaintenance: {
              increment: p.blockTimeMinutes ?? 0,
            },
            lastWearPirepId: p.id,
            lastVamsysPirepId: p.vamsysPirepId,
          },
        });
        if (next < 30) {
          const active = await tx.aircraftMaintenanceOrder.findFirst({
            where: {
              vamsysAircraftId: p.vamsysAircraftId!,
              status: {
                in: [
                  "REQUIRED",
                  "FERRY_TO_BASE",
                  "WAITING_MAINTENANCE",
                  "IN_PROGRESS",
                ],
              },
            },
          });
          if (!active) {
            const loc = await tx.aircraftLocationSnapshot.findUnique({
              where: { vamsysAircraftId: p.vamsysAircraftId! },
            });
            const type = next < 20 ? "AOG_RECOVERY" : "HEAVY_CHECK",
              target = type === "AOG_RECOVERY" ? 95 : 90;
            await tx.aircraftMaintenanceOrder.create({
              data: {
                vamsysAircraftId: p.vamsysAircraftId!,
                registration: p.aircraftRegistration,
                aircraftType: p.aircraftType,
                type,
                status:
                  next < 20
                    ? "REQUIRED"
                    : loc?.currentAirportIcao === "LEVC"
                      ? "WAITING_MAINTENANCE"
                      : "FERRY_TO_BASE",
                currentCondition: next,
                targetCondition: target,
                estimatedCostCents: calculateMaintenanceCost({
                  aircraftType: p.aircraftType,
                  currentCondition: next,
                  targetCondition: target,
                  maintenanceType: type,
                  aogRecovery: next < 20,
                }),
                currentAirportIcao: loc?.currentAirportIcao,
              },
            });
          }
        }
        return { applied: true, event };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (e) {
    await writeAuditLogSafely({
      action: "AIRCRAFT_WEAR_FAILED",
      entityType: "Pirep",
      entityId: p.id,
      message: e instanceof Error ? e.message : "Wear update failed",
    });
    return { applied: false, error: e };
  }
}
export async function assertAircraftDispatchAllowed(p: {
  vamsysAircraftId: string;
  offerType?: string | null;
  arrivalIcao: string;
}) {
  const s = await prisma.aircraftConditionSnapshot.findUnique({
    where: { vamsysAircraftId: p.vamsysAircraftId },
  });
  if (!s) return;
  if (["AOG", "IN_MAINTENANCE"].includes(s.operationalStatus))
    throw new Error("Aircraft is AOG or in maintenance.");
  if (
    s.operationalStatus === "FERRY_ONLY" &&
    !(
      ["MAINTENANCE_FERRY", "AIRCRAFT_REPOSITION"].includes(
        p.offerType ?? "",
      ) && p.arrivalIcao === "LEVC"
    )
  )
    throw new Error("Aircraft is ferry-only to LEVC.");
}
export async function completeMaintenance(
  orderId: string,
  staffUserId?: string,
) {
  return prisma.$transaction(async (tx) => {
    const o = await tx.aircraftMaintenanceOrder.findUnique({
      where: { id: orderId },
    });
    if (!o || o.status === "COMPLETED")
      throw new Error("Maintenance order is unavailable.");
    const cost = calculateMaintenanceCost({
      aircraftType: o.aircraftType,
      currentCondition: Number(o.currentCondition),
      targetCondition: Number(o.targetCondition),
      maintenanceType: o.type,
      aogRecovery: o.type === "AOG_RECOVERY",
    });
    await tx.companyExpense.create({
      data: {
        maintenanceOrderId: o.id,
        type: o.type === "AOG_RECOVERY" ? "AOG_RECOVERY" : "MAINTENANCE",
        amountCents: cost,
        source: "aircraft_maintenance",
        calculationDetails: {
          orderId: o.id,
          aircraft: o.registration,
          oldCondition: Number(o.currentCondition),
          newCondition: Number(o.targetCondition),
        },
      },
    });
    await tx.aircraftConditionSnapshot.update({
      where: { vamsysAircraftId: o.vamsysAircraftId },
      data: {
        conditionPercent: o.targetCondition,
        operationalStatus: "NORMAL",
        maintenanceStatus: "COMPLETED",
        cyclesSinceMaintenance: 0,
        blockMinutesSinceMaintenance: 0,
        lastMaintenanceAt: new Date(),
      },
    });
    await tx.aircraftLocationSnapshot.updateMany({
      where: {
        vamsysAircraftId: o.vamsysAircraftId,
        currentAirportIcao: "LEVC",
      },
      data: { status: "AVAILABLE", source: "MANUAL" },
    });
    const done = await tx.aircraftMaintenanceOrder.update({
      where: { id: o.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        actualCostCents: cost,
      },
    });
    await tx.aocAuditLog.create({
      data: {
        staffUserId,
        action: "AIRCRAFT_MAINTENANCE_COMPLETED",
        entityType: "AircraftMaintenanceOrder",
        entityId: o.id,
        message: `Maintenance completed for ${o.registration ?? o.vamsysAircraftId}.`,
        metadata: { cost },
      },
    });
    return done;
  });
}
export async function getMaintenanceFerryCandidates() {
  return prisma.aircraftConditionSnapshot.findMany({
    where: { operationalStatus: "FERRY_ONLY", maintenanceStatus: "REQUIRED" },
  });
}

export async function initializeAircraftConditions(staffUserId?: string) {
  const result = {
    created: 0,
    existing: 0,
    skipped: 0,
    errors: [] as string[],
  };
  await writeAuditLogSafely({
    staffUserId,
    action: "AIRCRAFT_CONDITION_INITIALIZE_STARTED",
    entityType: "AircraftConditionSnapshot",
    message: "Fleet condition initialization started.",
  });
  try {
    const [aircraft, locations, existing] = await Promise.all([
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
    const known = new Set(existing.map((x) => x.vamsysAircraftId));
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
      inventory.set(row.vamsysAircraftId, {
        ...inventory.get(row.vamsysAircraftId),
        ...row,
        vamsysAircraftId: row.vamsysAircraftId,
        registration:
          row.registration ??
          inventory.get(row.vamsysAircraftId)?.registration ??
          null,
        aircraftType:
          row.aircraftType ??
          inventory.get(row.vamsysAircraftId)?.aircraftType ??
          null,
      });
    }
    for (const row of inventory.values()) {
      if (!row.vamsysAircraftId) {
        result.skipped++;
        continue;
      }
      if (known.has(row.vamsysAircraftId)) {
        result.existing++;
        continue;
      }
      try {
        await prisma.aircraftConditionSnapshot.create({
          data: {
            vamsysAircraftId: row.vamsysAircraftId,
            registration: row.registration,
            aircraftType: row.aircraftType,
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
        await writeAuditLogSafely({
          staffUserId,
          action: "AIRCRAFT_CONDITION_CREATED_FROM_INVENTORY",
          entityType: "AircraftConditionSnapshot",
          message: `Condition initialized for ${row.registration ?? row.vamsysAircraftId}.`,
          metadata: { vamsysAircraftId: row.vamsysAircraftId },
        });
      } catch (error) {
        result.errors.push(
          `${row.vamsysAircraftId}: ${error instanceof Error ? error.message : "unknown error"}`,
        );
      }
    }
    await writeAuditLogSafely({
      staffUserId,
      action: "AIRCRAFT_CONDITION_INITIALIZE_COMPLETED",
      entityType: "AircraftConditionSnapshot",
      message: `Condition initialization created ${result.created}; ${result.existing} already existed.`,
      metadata: result,
    });
    return result;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Initialization failed";
    result.errors.push(message);
    await writeAuditLogSafely({
      staffUserId,
      action: "AIRCRAFT_CONDITION_INITIALIZE_FAILED",
      entityType: "AircraftConditionSnapshot",
      message,
    });
    return result;
  }
}
