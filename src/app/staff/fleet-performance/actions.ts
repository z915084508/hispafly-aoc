"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireStaffPermission } from "@/lib/staff/authorization";

const number = (data: FormData, key: string) => { const raw = String(data.get(key) ?? "").trim(); if (!raw) return null; const value = Number(raw); if (!Number.isFinite(value)) throw new Error(`${key} is invalid.`); return value; };
export async function saveAircraftPerformanceAction(formData: FormData) {
  const aircraftId = String(formData.get("aircraftId") ?? ""); let error: string | null = null;
  try {
    const staff = await requireStaffPermission("FLIGHT_OFFER_MANAGE", { entityType: "AircraftPerformanceProfile", entityId: aircraftId, attemptedAction: "update aircraft performance" });
    const data = { operatingEmptyWeightKg: number(formData, "operatingEmptyWeightKg"), maxZeroFuelWeightKg: number(formData, "maxZeroFuelWeightKg"), maxTakeoffWeightKg: number(formData, "maxTakeoffWeightKg"), maxLandingWeightKg: number(formData, "maxLandingWeightKg"), maxFuelKg: number(formData, "maxFuelKg"), maxPayloadKg: number(formData, "maxPayloadKg"), defaultCostIndex: number(formData, "defaultCostIndex"), fuelBiasPercent: number(formData, "fuelBiasPercent") ?? 0, taxiFuelKg: number(formData, "taxiFuelKg"), locked: formData.get("locked") === "yes", notes: String(formData.get("notes") ?? "").trim() || null };
    await prisma.aircraftPerformanceProfile.upsert({ where: { aircraftId }, create: { aircraftId, ...data }, update: data });
    await prisma.aocAuditLog.create({ data: { staffUserId: staff.id, action: "AIRCRAFT_PERFORMANCE_UPDATED", entityType: "Aircraft", entityId: aircraftId, message: `${staff.name} updated HISPAFLY aircraft performance.`, metadata: { fuelBiasPercent: data.fuelBiasPercent } } });
    revalidatePath("/staff/fleet-performance");
  } catch (caught) { error = caught instanceof Error ? caught.message : "Save failed"; }
  redirect(`/staff/fleet-performance?${error ? `error=${encodeURIComponent(error)}` : "success=Performance+saved"}`);
}
