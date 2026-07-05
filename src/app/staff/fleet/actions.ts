"use server";

import { revalidatePath } from "next/cache";
import type { AircraftLocationStatus } from "@prisma/client";
import { requireStaffPermission } from "@/lib/staff/authorization";
import { setAircraftLocationManually, syncAircraftLocationsFromPireps } from "@/lib/aircraft-location/tracker";
import { prisma } from "@/lib/prisma";
import { completeMaintenance } from "@/lib/aircraft-maintenance/service";

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

export async function maintenanceAction(formData: FormData) {
  const staff=await requireStaffPermission("FLIGHT_OFFER_MANAGE",{entityType:"AircraftMaintenance",attemptedAction:"manage maintenance"});
  const action=String(formData.get("action")??""), aircraftId=String(formData.get("aircraftId")??""), orderId=String(formData.get("orderId")??"");
  if(action==="complete"){await completeMaintenance(orderId,staff.id);}
  else if(action==="start"){await prisma.aircraftMaintenanceOrder.update({where:{id:orderId},data:{status:"IN_PROGRESS",startedAt:new Date()}});await prisma.aircraftConditionSnapshot.update({where:{vamsysAircraftId:aircraftId},data:{operationalStatus:"IN_MAINTENANCE",maintenanceStatus:"IN_PROGRESS"}});}
  else {const condition=Math.max(0,Math.min(100,Number(formData.get("condition"))));const status=action==="aog"?"AOG":condition>=80?"NORMAL":condition>=60?"WATCH":condition>=40?"CAUTION":condition>=30?"MAINT_REQUIRED":condition>=20?"FERRY_ONLY":"AOG";await prisma.aircraftConditionSnapshot.upsert({where:{vamsysAircraftId:aircraftId},create:{vamsysAircraftId:aircraftId,conditionPercent:condition,operationalStatus:status,maintenanceStatus:status==="AOG"?"REQUIRED":"NONE"},update:{conditionPercent:condition,operationalStatus:status,maintenanceStatus:status==="AOG"?"REQUIRED":undefined}});}
  await prisma.aocAuditLog.create({data:{staffUserId:staff.id,action:action==="complete"?"AIRCRAFT_MAINTENANCE_COMPLETED":action==="start"?"AIRCRAFT_MAINTENANCE_STARTED":action==="aog"?"AIRCRAFT_AOG_DECLARED":"AIRCRAFT_CONDITION_MANUAL_UPDATE",entityType:"AircraftConditionSnapshot",entityId:aircraftId,message:`Aircraft maintenance action: ${action}`}});
  revalidatePath("/staff/fleet");revalidatePath("/pilot/fleet");
}
