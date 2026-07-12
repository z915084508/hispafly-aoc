"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireStaffPermission } from "@/lib/staff/authorization";
import { parsePerformanceCsv } from "@/lib/fleet-performance/csv";
import { fleetKeyForAircraft, groupAircraftByFleet } from "@/lib/fleet-performance/fleet";

const number = (data: FormData, key: string) => { const raw = String(data.get(key) ?? "").trim(); if (!raw) return null; const value = Number(raw); if (!Number.isFinite(value)) throw new Error(`${key} is invalid.`); return value; };
export async function saveAircraftPerformanceAction(formData: FormData) {
  const fleetKey = String(formData.get("fleetKey") ?? ""); let error: string | null = null, updated = 0;
  try {
    const staff = await requireStaffPermission("AIRCRAFT_PERFORMANCE_EDIT", { entityType: "AircraftPerformanceProfile", entityId: fleetKey, attemptedAction: "update fleet performance" });
    const data = { operatingEmptyWeightKg: number(formData, "operatingEmptyWeightKg"), maxZeroFuelWeightKg: number(formData, "maxZeroFuelWeightKg"), maxTakeoffWeightKg: number(formData, "maxTakeoffWeightKg"), maxLandingWeightKg: number(formData, "maxLandingWeightKg"), maxFuelKg: number(formData, "maxFuelKg"), maxPayloadKg: number(formData, "maxPayloadKg"), defaultCostIndex: number(formData, "defaultCostIndex"), fuelBiasPercent: number(formData, "fuelBiasPercent") ?? 0, taxiFuelKg: number(formData, "taxiFuelKg"), locked: formData.get("locked") === "yes", notes: String(formData.get("notes") ?? "").trim() || null };
    const aircraftData = { seatCapacity: number(formData, "seatCapacity"), cargoCapacityKg: number(formData, "cargoCapacityKg") };
    const aircraft = (await prisma.aircraft.findMany()).filter((item) => fleetKeyForAircraft(item) === fleetKey);
    if (!aircraft.length) throw new Error("Fleet was not found.");
    await prisma.$transaction([
      prisma.aircraft.updateMany({ where: { id: { in: aircraft.map((item) => item.id) } }, data: aircraftData }),
      ...aircraft.map((item) => prisma.aircraftPerformanceProfile.upsert({ where: { aircraftId: item.id }, create: { aircraftId: item.id, ...data }, update: data })),
      prisma.aocAuditLog.create({ data: { staffUserId: staff.id, action: "FLEET_PERFORMANCE_UPDATED", entityType: "AircraftFleet", entityId: fleetKey, message: `${staff.name} updated performance for ${aircraft.length} aircraft.`, metadata: { aircraftCount: aircraft.length, fuelBiasPercent: data.fuelBiasPercent } } }),
    ]);
    updated = aircraft.length;
    revalidatePath("/staff/fleet-performance");
  } catch (caught) { error = caught instanceof Error ? caught.message : "Save failed"; }
  redirect(`/staff/fleet-performance?${error ? `error=${encodeURIComponent(error)}` : `success=${encodeURIComponent(`Performance applied to ${updated} aircraft`)}`}`);
}

const optionalNumber = (raw: string, column: string, row: number, options: { integer?: boolean; min?: number; max?: number } = {}) => {
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || (options.integer && !Number.isInteger(value)) || (options.min != null && value < options.min) || (options.max != null && value > options.max)) throw new Error(`Row ${row}: ${column} is invalid.`);
  return value;
};

export async function importAircraftPerformanceAction(formData: FormData) {
  let error: string | null = null, updatedAircraft = 0, updatedFleets = 0;
  try {
    const staff = await requireStaffPermission("AIRCRAFT_PERFORMANCE_EDIT", { entityType: "AircraftPerformanceProfile", attemptedAction: "bulk import aircraft performance" });
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw new Error("Choose a completed CSV file first.");
    if (file.size > 2_000_000) throw new Error("The CSV file must be smaller than 2 MB.");
    const rows = parsePerformanceCsv(await file.text());
    if (!rows.length) throw new Error("The CSV does not contain any fleet rows.");
    const aircraft = await prisma.aircraft.findMany();
    const fleets = new Map(groupAircraftByFleet(aircraft).map((group) => [group.fleetKey, group.members]));
    const seen = new Set<string>();
    const updates = rows.map((row, index) => {
      const rowNumber = index + 2;
      const members = fleets.get(row.fleetKey);
      if (!members?.length) throw new Error(`Row ${rowNumber}: fleet was not found.`);
      if (seen.has(row.fleetKey)) throw new Error(`Row ${rowNumber}: fleet is duplicated.`);
      seen.add(row.fleetKey);
      return { fleetKey: row.fleetKey, members, aircraftData: {
        seatCapacity: optionalNumber(row.seatCapacity, "seatCapacity", rowNumber, { integer: true, min: 0, max: 1000 }),
        cargoCapacityKg: optionalNumber(row.cargoCapacityKg, "cargoCapacityKg", rowNumber, { integer: true, min: 0 }),
      }, data: {
        operatingEmptyWeightKg: optionalNumber(row.operatingEmptyWeightKg, "operatingEmptyWeightKg", rowNumber, { integer: true, min: 0 }),
        maxZeroFuelWeightKg: optionalNumber(row.maxZeroFuelWeightKg, "maxZeroFuelWeightKg", rowNumber, { integer: true, min: 0 }),
        maxTakeoffWeightKg: optionalNumber(row.maxTakeoffWeightKg, "maxTakeoffWeightKg", rowNumber, { integer: true, min: 0 }),
        maxLandingWeightKg: optionalNumber(row.maxLandingWeightKg, "maxLandingWeightKg", rowNumber, { integer: true, min: 0 }),
        maxFuelKg: optionalNumber(row.maxFuelKg, "maxFuelKg", rowNumber, { integer: true, min: 0 }),
        maxPayloadKg: optionalNumber(row.maxPayloadKg, "maxPayloadKg", rowNumber, { integer: true, min: 0 }),
        defaultCostIndex: optionalNumber(row.defaultCostIndex, "defaultCostIndex", rowNumber, { integer: true, min: 0, max: 999 }),
        fuelBiasPercent: optionalNumber(row.fuelBiasPercent, "fuelBiasPercent", rowNumber, { min: -10, max: 15 }) ?? 0,
        taxiFuelKg: optionalNumber(row.taxiFuelKg, "taxiFuelKg", rowNumber, { integer: true, min: 0 }),
        locked: ["TRUE", "YES", "1"].includes(row.locked.toUpperCase()),
        notes: row.notes || null,
      }};
    });
    const aircraftCount = updates.reduce((total, update) => total + update.members.length, 0);
    await prisma.$transaction([
      ...updates.flatMap((update) => [
        prisma.aircraft.updateMany({ where: { id: { in: update.members.map((item) => item.id) } }, data: update.aircraftData }),
        ...update.members.map((item) => prisma.aircraftPerformanceProfile.upsert({ where: { aircraftId: item.id }, create: { aircraftId: item.id, ...update.data }, update: update.data })),
      ]),
      prisma.aocAuditLog.create({ data: { staffUserId: staff.id, action: "FLEET_PERFORMANCE_BULK_IMPORTED", entityType: "AircraftFleet", message: `${staff.name} imported ${updates.length} fleet profiles for ${aircraftCount} aircraft.`, metadata: { fleetCount: updates.length, aircraftCount, fileName: file.name } } }),
    ]);
    updatedFleets = updates.length;
    updatedAircraft = updates.reduce((total, update) => total + update.members.length, 0);
    revalidatePath("/staff/fleet-performance");
  } catch (caught) { error = caught instanceof Error ? caught.message : "Import failed"; }
  redirect(`/staff/fleet-performance?${error ? `error=${encodeURIComponent(error)}` : `success=${encodeURIComponent(`${updatedFleets} fleets imported; ${updatedAircraft} aircraft updated`)}`}`);
}
