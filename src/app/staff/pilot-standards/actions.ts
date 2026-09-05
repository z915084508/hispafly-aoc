"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireStaffPermission } from "@/lib/staff/authorization";
import { recordPilotRiskSignal, setPilotRiskFlagStatus } from "@/lib/pilot-risk/repository";
import { refreshTrendRiskSignalsForActivePilots } from "@/lib/pilot-risk/service";
import type { PilotRiskCategory, PilotRiskSeverity } from "@/lib/pilot-risk/types";

const value=(form:FormData,key:string)=>String(form.get(key)??"").trim();
const CATEGORIES=new Set<PilotRiskCategory>(["SAFETY","SOP","OPERATIONS","RELIABILITY","COMMAND","APPROACH_STABILITY","LANDING_TECHNIQUE","CONDUCT","OTHER"]);
const SEVERITIES=new Set<PilotRiskSeverity>(["LOW","MODERATE","HIGH","CRITICAL"]);
const DECISIONS=new Set(["CONFIRMED","DISMISSED","RESOLVED"] as const);

export async function refreshRiskSignalsAction(){
  const staff=await requireStaffPermission("PILOT_RESTRICTION_MANAGE",{entityType:"PilotRiskFlag",attemptedAction:"refresh Pilot risk detections"});
  const result=await refreshTrendRiskSignalsForActivePilots();
  await prisma.aocAuditLog.create({data:{staffUserId:staff.id,action:"PILOT_RISK_SIGNALS_REFRESHED",entityType:"PilotRiskFlag",message:`Standards refreshed trend risk signals for ${result.pilots} active pilots; ${result.signals} signals detected.`,metadata:result}});
  redirect(`/staff/pilot-standards?success=${encodeURIComponent(`${result.signals} risk signals detected or refreshed.`)}`);
}

export async function createManualRiskFlagAction(form:FormData){
  const pilotId=value(form,"pilotId"),category=value(form,"category") as PilotRiskCategory,severity=value(form,"severity") as PilotRiskSeverity,title=value(form,"title"),reason=value(form,"reason");
  const staff=await requireStaffPermission("PILOT_RESTRICTION_MANAGE",{entityType:"Pilot",entityId:pilotId,attemptedAction:"create manual Pilot risk flag"});
  if(!pilotId||!title||!reason||!CATEGORIES.has(category)||!SEVERITIES.has(severity)) redirect("/staff/pilot-standards?error=Invalid+or+missing+risk+fields");
  const pilot=await prisma.pilot.findUnique({where:{id:pilotId},select:{id:true}});if(!pilot)redirect("/staff/pilot-standards?error=Pilot+not+found");
  await recordPilotRiskSignal({pilotId,source:"STAFF",category,severity,signalKey:`staff:${randomUUID()}`,title,reason,evidence:{createdByStaffId:staff.id}});
  await prisma.aocAuditLog.create({data:{staffUserId:staff.id,action:"PILOT_RISK_FLAG_CREATED",entityType:"Pilot",entityId:pilotId,message:`Standards created ${severity} ${category} risk flag: ${title}.`}});
  redirect("/staff/pilot-standards?success=Risk+flag+created");
}

export async function reviewRiskFlagAction(form:FormData){
  const id=value(form,"id"),pilotId=value(form,"pilotId"),decision=value(form,"decision"),comment=value(form,"comment");
  if(!DECISIONS.has(decision as "CONFIRMED"|"DISMISSED"|"RESOLVED")) redirect("/staff/pilot-standards?error=Invalid+risk+review+decision");
  const normalized=decision as "CONFIRMED"|"DISMISSED"|"RESOLVED";
  const staff=await requireStaffPermission("PILOT_RESTRICTION_MANAGE",{entityType:"PilotRiskFlag",entityId:id,attemptedAction:`${normalized.toLowerCase()} Pilot risk flag`});
  await setPilotRiskFlagStatus({id,status:normalized,staffId:staff.id,comment});
  await prisma.aocAuditLog.create({data:{staffUserId:staff.id,action:`PILOT_RISK_${normalized}`,entityType:"PilotRiskFlag",entityId:id,message:`Standards marked Pilot risk flag ${normalized.toLowerCase()}.`,metadata:{pilotId,comment:comment||null}}});
  redirect("/staff/pilot-standards?success=Risk+flag+updated");
}
