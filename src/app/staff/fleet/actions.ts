"use server";

import { revalidatePath } from "next/cache";
import type { AircraftLocationStatus } from "@prisma/client";
import { requireStaffPermission } from "@/lib/staff/authorization";
import { setAircraftLocationManually, syncAircraftLocationsFromPireps } from "@/lib/aircraft-location/tracker";
import { prisma } from "@/lib/prisma";
import { completeMaintenance, initializeAircraftConditions } from "@/lib/aircraft-maintenance/service";
import { redirect } from "next/navigation";
import { writeAuditLogSafely } from "@/lib/audit/log";

const allowed = new Set<AircraftLocationStatus>(["AVAILABLE", "RESERVED", "IN_FLIGHT", "MAINTENANCE", "UNKNOWN"]);

export async function setAircraftLocationAction(formData: FormData) {
  const staff = await requireStaffPermission("FLEET_LOCATION_EDIT", { entityType: "AircraftLocationSnapshot", attemptedAction: "actualizar la ubicación de una aeronave" });
  const vamsysAircraftId = String(formData.get("vamsysAircraftId") ?? "").trim();
  const statusValue = String(formData.get("status") ?? "UNKNOWN") as AircraftLocationStatus;
  if (!vamsysAircraftId) throw new Error("Aircraft ID is required.");
  if (!allowed.has(statusValue)) throw new Error("Invalid aircraft status.");
  await setAircraftLocationManually({ vamsysAircraftId, registration: String(formData.get("registration") ?? "").trim() || null, aircraftType: String(formData.get("aircraftType") ?? "").trim() || null, airportIcao: String(formData.get("airportIcao") ?? "").trim() || null, status: statusValue, notes: String(formData.get("notes") ?? "").trim() || null, staffUserId: staff.id });
  revalidatePath("/staff/fleet"); revalidatePath("/pilot/fleet");
}

export async function syncAircraftLocationsAction() {
  await requireStaffPermission("FLEET_LOCATION_SYNC", { entityType: "AircraftLocationSnapshot", attemptedAction: "sincronizar ubicaciones desde PIREPs" });
  await syncAircraftLocationsFromPireps();
  revalidatePath("/staff/fleet"); revalidatePath("/pilot/fleet");
}

export async function maintenanceAction(formData: FormData) {
  const staff=await requireStaffPermission("AIRCRAFT_MAINTENANCE_MANAGE",{entityType:"AircraftMaintenance",attemptedAction:"manage maintenance"});
  const action=String(formData.get("action")??""), aircraftId=String(formData.get("aircraftId")??""), orderId=String(formData.get("orderId")??"");
  if(action==="complete"){await completeMaintenance(orderId,staff.id);}
  else if(action==="start"){await prisma.aircraftMaintenanceOrder.update({where:{id:orderId},data:{status:"IN_PROGRESS",startedAt:new Date()}});await prisma.aircraftConditionSnapshot.update({where:{vamsysAircraftId:aircraftId},data:{operationalStatus:"IN_MAINTENANCE",maintenanceStatus:"IN_PROGRESS"}});}
  else {const condition=Math.max(0,Math.min(100,Number(formData.get("condition"))));const status=action==="aog"?"AOG":condition>=80?"NORMAL":condition>=60?"WATCH":condition>=40?"CAUTION":condition>=30?"MAINT_REQUIRED":condition>=20?"FERRY_ONLY":"AOG";await prisma.aircraftConditionSnapshot.upsert({where:{vamsysAircraftId:aircraftId},create:{vamsysAircraftId:aircraftId,conditionPercent:condition,operationalStatus:status,maintenanceStatus:status==="AOG"?"REQUIRED":"NONE"},update:{conditionPercent:condition,operationalStatus:status,maintenanceStatus:status==="AOG"?"REQUIRED":undefined}});}
  await prisma.aocAuditLog.create({data:{staffUserId:staff.id,action:action==="complete"?"AIRCRAFT_MAINTENANCE_COMPLETED":action==="start"?"AIRCRAFT_MAINTENANCE_STARTED":action==="aog"?"AIRCRAFT_AOG_DECLARED":"AIRCRAFT_CONDITION_MANUAL_UPDATE",entityType:"AircraftConditionSnapshot",entityId:aircraftId,message:`Aircraft maintenance action: ${action}`}});
  revalidatePath("/staff/fleet");revalidatePath("/pilot/fleet");
}

export async function initializeAircraftConditionsAction() {
  const staff=await requireStaffPermission("AIRCRAFT_CONDITION_EDIT",{entityType:"AircraftConditionSnapshot",attemptedAction:"initialize fleet conditions"});
  const result=await initializeAircraftConditions(staff.id);revalidatePath("/staff/fleet");revalidatePath("/pilot/fleet");
  const query=new URLSearchParams({created:String(result.created),existing:String(result.existing),skipped:String(result.skipped),errors:String(result.errors.length)});
  redirect(`/staff/fleet?${query}`);
}

function cleanText(value: FormDataEntryValue | null, maxLength = 240) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, maxLength) : null;
}

function cleanIcao(value: FormDataEntryValue | null) {
  const code = String(value ?? "").trim().toUpperCase();
  return /^[A-Z0-9]{4}$/.test(code) ? code : null;
}

function cleanUrl(value: FormDataEntryValue | null) {
  const url = String(value ?? "").trim();
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.toString().slice(0, 500) : null;
  } catch {
    return null;
  }
}

export async function updatePublicFleetAircraftAction(formData: FormData) {
  const staff = await requireStaffPermission("PUBLIC_FLEET_MANAGE", {
    entityType: "Aircraft",
    attemptedAction: "publish aircraft information to the public website",
  });
  const aircraftId = String(formData.get("aircraftId") ?? "").trim();
  if (!aircraftId) throw new Error("Aircraft ID is required.");

  const publicVisible = formData.get("publicVisible") === "on";
  const publicDisplayOrder = Number(formData.get("publicDisplayOrder") ?? 0);
  const safeOrder = Number.isFinite(publicDisplayOrder) ? Math.max(0, Math.round(publicDisplayOrder)) : 0;

  await prisma.aircraft.update({
    where: { id: aircraftId },
    data: {
      publicVisible,
      publicDisplayName: cleanText(formData.get("publicDisplayName"), 80),
      publicDescription: cleanText(formData.get("publicDescription"), 600),
      publicImageUrl: cleanUrl(formData.get("publicImageUrl")),
      publicBaseIcao: cleanIcao(formData.get("publicBaseIcao")),
      publicStatus: cleanText(formData.get("publicStatus"), 40),
      publicDisplayOrder: safeOrder,
      publicPublishedAt: publicVisible ? new Date() : null,
    },
  });

  await writeAuditLogSafely({
    staffUserId: staff.id,
    action: publicVisible ? "PUBLIC_FLEET_AIRCRAFT_PUBLISHED" : "PUBLIC_FLEET_AIRCRAFT_UNPUBLISHED",
    entityType: "Aircraft",
    entityId: aircraftId,
    message: `Public fleet visibility ${publicVisible ? "enabled" : "disabled"} for aircraft ${aircraftId}.`,
    metadata: { publicVisible, publicDisplayOrder: safeOrder },
  });

  revalidatePath("/staff/fleet");
  revalidatePath("/api/public/fleet");
}
