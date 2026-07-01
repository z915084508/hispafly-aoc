"use server";

import { revalidatePath } from "next/cache";
import type { AircraftLocationStatus } from "@prisma/client";
import { requireStaffPermission } from "@/lib/staff/authorization";
import { setAircraftLocationManually, syncAircraftLocationsFromPireps } from "@/lib/aircraft-location/tracker";

const allowed = new Set<AircraftLocationStatus>(["AVAILABLE", "RESERVED", "IN_FLIGHT", "MAINTENANCE", "UNKNOWN"]);

export async function setAircraftLocationAction(formData: FormData) {
  const staff = await requireStaffPermission("FLIGHT_OFFER_MANAGE", { entityType: "AircraftLocationSnapshot", attemptedAction: "actualizar la ubicación de una aeronave" });
  const vamsysAircraftId = String(formData.get("vamsysAircraftId") ?? "").trim();
  const statusValue = String(formData.get("status") ?? "UNKNOWN") as AircraftLocationStatus;
  if (!vamsysAircraftId) throw new Error("Aircraft ID is required.");
  if (!allowed.has(statusValue)) throw new Error("Invalid aircraft status.");
  await setAircraftLocationManually({ vamsysAircraftId, registration: String(formData.get("registration") ?? "").trim() || null, aircraftType: String(formData.get("aircraftType") ?? "").trim() || null, airportIcao: String(formData.get("airportIcao") ?? "").trim() || null, status: statusValue, notes: String(formData.get("notes") ?? "").trim() || null, staffUserId: staff.id });
  revalidatePath("/staff/fleet"); revalidatePath("/pilot/fleet");
}

export async function syncAircraftLocationsAction() {
  await requireStaffPermission("FLIGHT_OFFER_MANAGE", { entityType: "AircraftLocationSnapshot", attemptedAction: "sincronizar ubicaciones desde PIREPs" });
  await syncAircraftLocationsFromPireps();
  revalidatePath("/staff/fleet"); revalidatePath("/pilot/fleet");
}
