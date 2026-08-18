"use server";
import type { AircraftOperationMode, NativeAircraftStatus } from "@prisma/client";
import { redirect } from "next/navigation";
import { changeAircraftStatus, completeAircraftDelivery, copyAircraftToNative, correctAircraftTotals, createNativeAircraft, setAircraftHubs, setNativeAircraftLocation, updateNativeAircraft } from "@/lib/native-flight/aircraft";
import { ensureNativeAircraftCondition } from "@/lib/native-flight/aircraft-condition-init";
import { aircraftRegistrationKey, aircraftSelcalKey } from "@/lib/native-flight/aircraft-identity";
import { requireStaffPermission } from "@/lib/staff/authorization";
import { prisma } from "@/lib/prisma";
const v=(f:FormData,k:string)=>String(f.get(k)??"").trim(),n=(f:FormData,k:string)=>v(f,k)===""?null:Number(v(f,k)),d=(f:FormData,k:string)=>v(f,k)?new Date(`${v(f,k)}T00:00:00Z`):null;
const input=(f:FormData)=>{const requestedMode=v(f,"operationMode").toUpperCase();const deliveryActive=requestedMode==="DELIVERY";const postDeliveryMode=(v(f,"postDeliveryOperationMode").toUpperCase()||"SCHEDULED") as AircraftOperationMode;const operationMode=(deliveryActive?"SCHEDULED":requestedMode) as AircraftOperationMode;return{registration:v(f,"registration"),aircraftType:v(f,"aircraftType"),fleetId:v(f,"fleetId"),hubAirportIds:f.getAll("hubAirportIds").map(String),operationMode,name:v(f,"name"),serialNumber:v(f,"serialNumber"),selcal:v(f,"selcal"),deliveryDate:d(f,"deliveryDate"),inServiceDate:d(f,"inServiceDate"),cabinConfiguration:v(f,"cabinConfiguration"),seatCapacity:n(f,"seatCapacity"),cargoCapacityKg:n(f,"cargoCapacityKg"),internalNotes:v(f,"internalNotes"),delivery:{active:deliveryActive,originIcao:v(f,"deliveryOriginIcao"),destinationIcao:v(f,"deliveryDestinationIcao"),postDeliveryOperationMode:postDeliveryMode}}};
const msg=(e:unknown,f:string)=>e instanceof Error?e.message:f;
const pickRandom=<T>(items:T[])=>items.length?items[Math.floor(Math.random()*items.length)]:null;
export async function suggestAircraftIdentityAction(aircraftType:string){
  await requireStaffPermission("AIRCRAFT_CREATE",{entityType:"Aircraft",attemptedAction:"suggest Aircraft identity"});
  const type=aircraftType.trim().toUpperCase();
  if(!/^[A-Z0-9]{2,4}$/.test(type))throw new Error("Enter a valid ICAO Aircraft Type first.");
  const rows=await prisma.aircraft.findMany({select:{registration:true,selcal:true}});
  const registrations=new Set(rows.map(x=>aircraftRegistrationKey(x.registration)).filter(Boolean));
  const availableRegistrations:string[]=[];
  for(let n=0;n<17576;n++){
    const code=[Math.floor(n/676),Math.floor(n/26)%26,n%26].map(x=>String.fromCharCode(65+x)).join("");
    const candidate=`EC-${code}`;
    if(!registrations.has(aircraftRegistrationKey(candidate)))availableRegistrations.push(candidate);
  }
  const selcals=new Set(rows.map(x=>aircraftSelcalKey(x.selcal)).filter(Boolean));
  const letters="ABCDEFGHJKLMNPQRS";
  const availableSelcals:string[]=[];
  for(let a=0;a<letters.length;a++)for(let b=a+1;b<letters.length;b++)for(let c=0;c<letters.length;c++)for(let d=c+1;d<letters.length;d++){
    const code=`${letters[a]}${letters[b]}${letters[c]}${letters[d]}`;
    if(new Set(code).size===4&&!selcals.has(code))availableSelcals.push(`${code.slice(0,2)}-${code.slice(2)}`);
  }
  const registration=pickRandom(availableRegistrations),selcal=pickRandom(availableSelcals);
  if(!registration||!selcal)throw new Error("No unused registration or SELCAL combination is available.");
  return{registration,selcal};
}
const returnTarget=(f:FormData,fallback:string)=>{const target=v(f,"returnTo");return target.startsWith("/staff/aircraft")?target:fallback};
const withMessage=(target:string,key:"success"|"error",message:string)=>`${target}${target.includes("?")?"&":"?"}${key}=${encodeURIComponent(message)}`;
export async function createAircraftAction(f:FormData){let t="/staff/aircraft/new";try{const s=await requireStaffPermission("AIRCRAFT_CREATE",{entityType:"Aircraft",attemptedAction:"create Native Aircraft"}),x=await createNativeAircraft(input(f),s);await ensureNativeAircraftCondition(x.id);t=`/staff/aircraft/${x.id}?success=Aircraft%20created.`}catch(e){t+=`?error=${encodeURIComponent(msg(e,"Creation failed."))}`}redirect(t)}
export async function updateAircraftAction(f:FormData){const id=v(f,"id");let t=`/staff/aircraft/${id}/edit`;try{const s=await requireStaffPermission("AIRCRAFT_EDIT",{entityType:"Aircraft",entityId:id,attemptedAction:"edit Aircraft"});await updateNativeAircraft(id,input(f),s);await ensureNativeAircraftCondition(id);t=`/staff/aircraft/${id}?success=Aircraft%20updated.`}catch(e){t+=`?error=${encodeURIComponent(msg(e,"Update failed."))}`}redirect(t)}
export async function completeAircraftDeliveryAction(f:FormData){const id=v(f,"id");let t=`/staff/aircraft/${id}`;try{const s=await requireStaffPermission("AIRCRAFT_EDIT",{entityType:"Aircraft",entityId:id,attemptedAction:"complete Aircraft delivery"});await completeAircraftDelivery(id,s);t=withMessage(t,"success","Delivery completed. Aircraft entered service.")}catch(e){t=withMessage(t,"error",msg(e,"Delivery completion failed."))}redirect(t)}
export async function statusAction(f:FormData){const id=v(f,"id"),status=v(f,"status") as NativeAircraftStatus;let t=returnTarget(f,`/staff/aircraft/${id}`);try{const p=status==="RETIRED"?"AIRCRAFT_ARCHIVE":"AIRCRAFT_STATUS_MANAGE",s=await requireStaffPermission(p,{entityType:"Aircraft",entityId:id,attemptedAction:`change Aircraft to ${status}`});await changeAircraftStatus(id,status,s,v(f,"reason"));t=withMessage(t,"success","Status updated.")}catch(e){t=withMessage(t,"error",msg(e,"Status failed."))}redirect(t)}
export async function locationAction(f:FormData){const id=v(f,"id");let t=returnTarget(f,`/staff/aircraft/${id}`);try{const s=await requireStaffPermission("AIRCRAFT_LOCATION_MANAGE",{entityType:"Aircraft",entityId:id,attemptedAction:"manually correct Aircraft location"});await setNativeAircraftLocation(id,v(f,"airportId")||null,{latitude:n(f,"latitude"),longitude:n(f,"longitude")},v(f,"status") as NativeAircraftStatus,v(f,"notes"),v(f,"reason"),s);t=withMessage(t,"success","Location updated.")}catch(e){t=withMessage(t,"error",msg(e,"Location failed."))}redirect(t)}
export async function hubsAction(f:FormData){const id=v(f,"id");let t=returnTarget(f,`/staff/aircraft/${id}`);try{const s=await requireStaffPermission("AIRCRAFT_EDIT",{entityType:"Aircraft",entityId:id,attemptedAction:"change Aircraft operational HUBS"});await setAircraftHubs(id,f.getAll("hubAirportIds").map(String),s);t=withMessage(t,"success","Operational HUBS updated.")}catch(e){t=withMessage(t,"error",msg(e,"HUB update failed."))}redirect(t)}
export async function totalsAction(f:FormData){const id=v(f,"id");let t=`/staff/aircraft/${id}`;try{const s=await requireStaffPermission("AIRCRAFT_EDIT",{entityType:"Aircraft",entityId:id,attemptedAction:"correct Aircraft hours and cycles"});await correctAircraftTotals(id,Number(v(f,"totalFlightMinutes")),Number(v(f,"totalCycles")),v(f,"reason"),s);t+="?success=Totals%20corrected."}catch(e){t+=`?error=${encodeURIComponent(msg(e,"Correction failed."))}`}redirect(t)}
export async function copyAircraftAction(f:FormData){const id=v(f,"id");let t=`/staff/aircraft/${id}`;try{const s=await requireStaffPermission("AIRCRAFT_CREATE",{entityType:"Aircraft",entityId:id,attemptedAction:"copy Legacy Aircraft"}),x=await copyAircraftToNative(id,v(f,"registration"),v(f,"fleetId"),s);await ensureNativeAircraftCondition(x.id);t=`/staff/aircraft/${x.id}?success=Native%20Aircraft%20created.`}catch(e){t+=`?error=${encodeURIComponent(msg(e,"Copy failed."))}`}redirect(t)}
