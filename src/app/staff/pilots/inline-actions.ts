"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireStaffPermission } from "@/lib/staff/authorization";
import { HISPAFLY_HUB_ICAOS } from "@/lib/native-flight/hubs";

const value = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const target = (form: FormData) => { const requested = value(form, "returnTo"); return requested.startsWith("/staff/pilots") && !requested.includes("//") ? requested : "/staff/pilots"; };
const withResult = (url: string, key: "success" | "error", message: string) => `${url}${url.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(message)}`;

export async function updatePilotHubInlineAction(form: FormData) {
  const id = value(form, "id"), hubId = value(form, "hubId").toUpperCase(), returnTo = target(form);
  const staff = await requireStaffPermission("PILOT_EDIT", { entityType: "Pilot", entityId: id, attemptedAction: "change Pilot HUB inline" });
  if (!HISPAFLY_HUB_ICAOS.includes(hubId as (typeof HISPAFLY_HUB_ICAOS)[number])) redirect(withResult(returnTo, "error", "Invalid Pilot HUB."));
  const pilot = await prisma.pilot.findUnique({ where: { id }, select: { hubId: true } });
  if (!pilot) redirect(withResult(returnTo, "error", "Pilot not found."));
  await prisma.$transaction([prisma.pilot.update({ where: { id }, data: { hubId, base: hubId } }), prisma.aocAuditLog.create({ data: { staffUserId: staff.id, action: "PILOT_HUB_CHANGED", entityType: "Pilot", entityId: id, message: `Staff changed Pilot HUB to ${hubId}.`, metadata: { previousHub: pilot.hubId, newHub: hubId } } })]);
  redirect(withResult(returnTo, "success", "Pilot HUB updated."));
}

export async function updatePilotLocationInlineAction(form: FormData) {
  const id = value(form, "id"), airportId = value(form, "airportId"), returnTo = target(form);
  const staff = await requireStaffPermission("PILOT_EDIT", { entityType: "Pilot", entityId: id, attemptedAction: "change Pilot location inline" });
  const [pilot, airport] = await Promise.all([prisma.pilot.findUnique({ where: { id }, select: { currentAirportId: true } }), prisma.airport.findFirst({ where: { id: airportId, status: "ACTIVE", archivedAt: null }, select: { id: true, icao: true } })]);
  if (!pilot || !airport) redirect(withResult(returnTo, "error", "Pilot or location is invalid."));
  await prisma.$transaction([prisma.pilot.update({ where: { id }, data: { currentAirportId: airport.id, positionUpdatedAt: new Date(), positionSource: "STAFF_OVERRIDE" } }), prisma.aocAuditLog.create({ data: { staffUserId: staff.id, action: "PILOT_POSITION_UPDATED", entityType: "Pilot", entityId: id, message: `Staff moved Pilot location to ${airport.icao}.`, metadata: { previousAirportId: pilot.currentAirportId, newAirportId: airport.id } } })]);
  redirect(withResult(returnTo, "success", "Pilot location updated."));
}
