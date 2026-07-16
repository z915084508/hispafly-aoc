import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { StaffIdentity } from "@/lib/staff/currentStaff";
import {
  createAircraft,
  deleteAircraft,
  listFleetAircraft,
  updateAircraft,
} from "./client";
import { externalAircraftToPrisma, formToPayload } from "./mapper";
import type { AircraftFormInput } from "./types";
const sid = (s: StaffIdentity) => (s.id === "development-staff" ? null : s.id);
async function fleetFor(localId: string) {
  const f = await prisma.fleet.findUnique({ where: { id: localId } });
  if (!f?.vamsysFleetId) throw new Error("Select a synchronized vAMSYS fleet.");
  return f;
}
export async function syncAircraft(s: StaffIdentity) {
  const fleets = await prisma.fleet.findMany({
    where: { vamsysFleetId: { not: null } },
  });
  let imported = 0,
    updated = 0,
    missing = 0;
  const seen = new Set<string>();
  await prisma.aocAuditLog.create({
    data: {
      staffUserId: sid(s),
      action: "VAMSYS_AIRCRAFT_SYNC_STARTED",
      entityType: "Aircraft",
      message: "Aircraft synchronization started.",
    },
  });
  for (const f of fleets) {
    for (const a of await listFleetAircraft(f.vamsysFleetId!)) {
      const id = String(a.id);
      seen.add(id);
      const exists = await prisma.aircraft.findUnique({
        where: { vamsysAircraftId: id },
        select: { id: true },
      });
      await prisma.aircraft.upsert({
        where: { vamsysAircraftId: id },
        create: externalAircraftToPrisma(a, f.name),
        update: externalAircraftToPrisma(a, f.name),
      });
      if (exists) updated++;
      else imported++;
    }
  }
  const stale = await prisma.aircraft.findMany({
    where: { syncStatus: { not: "MISSING" }, vamsysAircraftId: { not: null } },
    select: { id: true, vamsysAircraftId: true },
  });
  const ids = stale
    .filter((a) => a.vamsysAircraftId && !seen.has(a.vamsysAircraftId))
    .map((a) => a.id);
  if (ids.length)
    missing = (
      await prisma.aircraft.updateMany({
        where: { id: { in: ids } },
        data: { syncStatus: "MISSING" },
      })
    ).count;
  await prisma.aocAuditLog.create({
    data: {
      staffUserId: sid(s),
      action: "VAMSYS_AIRCRAFT_SYNC_COMPLETED",
      entityType: "Aircraft",
      message: "Aircraft synchronization completed.",
      metadata: { imported, updated, missing },
    },
  });
  revalidatePath("/staff/aircraft");
  return { imported, updated, missing };
}
export async function createAndPublishAircraft(
  i: AircraftFormInput,
  s: StaffIdentity,
) {
  if (
    await prisma.aircraft.findFirst({
      where: { registration: { equals: i.registration, mode: "insensitive" } },
    })
  )
    throw new Error("This registration already exists.");
  const f = await fleetFor(i.fleetLocalId);
  const ext = await createAircraft(f.vamsysFleetId!, formToPayload(i));
  const row = await prisma.aircraft.create({
    data: {
      ...externalAircraftToPrisma(ext, f.name),
      internalNotes: i.internalNotes,
      lastPublishedAt: new Date(),
    },
  });
  await prisma.aocAuditLog.create({
    data: {
      staffUserId: sid(s),
      action: "VAMSYS_AIRCRAFT_CREATED",
      entityType: "Aircraft",
      entityId: row.id,
      message: `${i.registration} published to vAMSYS.`,
    },
  });
  return row;
}
export async function updateAndPublishAircraft(
  i: AircraftFormInput,
  s: StaffIdentity,
) {
  if (!i.localId) throw new Error("Missing aircraft ID.");
  const [a, f] = await Promise.all([
    prisma.aircraft.findUnique({ where: { id: i.localId } }),
    fleetFor(i.fleetLocalId),
  ]);
  if (!a?.vamsysAircraftId || !a.fleetId)
    throw new Error("Only published aircraft can be updated.");
  if (a.fleetId !== f.vamsysFleetId)
    throw new Error(
      "Changing fleet is not supported in this form. Synchronize and use the dedicated transfer workflow.",
    );
  const ext = await updateAircraft(
    a.fleetId,
    a.vamsysAircraftId,
    formToPayload(i),
  );
  const row = await prisma.aircraft.update({
    where: { id: a.id },
    data: {
      ...externalAircraftToPrisma(ext, f.name),
      internalNotes: i.internalNotes,
    },
  });
  await prisma.aocAuditLog.create({
    data: {
      staffUserId: sid(s),
      action: "VAMSYS_AIRCRAFT_UPDATED",
      entityType: "Aircraft",
      entityId: row.id,
      message: `${i.registration} updated in vAMSYS.`,
    },
  });
  return row;
}
export async function permanentlyDeleteAircraft(id: string, s: StaffIdentity) {
  const a = await prisma.aircraft.findUnique({ where: { id } });
  if (!a?.vamsysAircraftId || !a.fleetId)
    throw new Error("Aircraft is not published.");
  const [offers, bookings, maintenance] = await Promise.all([
    prisma.flightOffer.count({
      where: { vamsysAircraftId: a.vamsysAircraftId },
    }),
    prisma.pilotBooking.count({
      where: { vamsysAircraftId: a.vamsysAircraftId },
    }),
    prisma.aircraftMaintenanceOrder.count({
      where: {
        vamsysAircraftId: a.vamsysAircraftId,
        status: { not: "COMPLETED" },
      },
    }),
  ]);
  if (offers || bookings || maintenance)
    throw new Error(
      `Deletion blocked: ${offers} offers, ${bookings} bookings, ${maintenance} active maintenance orders.`,
    );
  await deleteAircraft(a.fleetId, a.vamsysAircraftId);
  await prisma.aircraft.delete({ where: { id } });
  await prisma.aocAuditLog.create({
    data: {
      staffUserId: sid(s),
      action: "VAMSYS_AIRCRAFT_DELETED",
      entityType: "Aircraft",
      entityId: id,
      message: `${a.registration} permanently deleted from vAMSYS.`,
    },
  });
  revalidatePath("/staff/aircraft");
}
