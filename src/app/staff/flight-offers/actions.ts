"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaffPermission } from "@/lib/staff/authorization";
import { operationsRequest } from "@/lib/vamsys/operations";

type JsonRow = Record<string, unknown>;
const record = (value: unknown): JsonRow | null => value && typeof value === "object" && !Array.isArray(value) ? value as JsonRow : null;

export async function getRouteFleetIdsAction(routeId: string) {
  await requireStaffPermission("FLIGHT_OFFER_MANAGE", { entityType: "FlightOffer", attemptedAction: "consultar flotas de una ruta" });
  if (!/^\d+$/.test(routeId)) return { fleetIds: [] as string[], error: "El route_id debe ser numérico." };

  try {
    const payload = await operationsRequest(`/routes/${encodeURIComponent(routeId)}?weight_unit=kg`);
    const root = record(payload);
    const data = record(root?.data) ?? root;
    const attributes = record(data?.attributes);
    const detail = attributes ? { ...data, ...attributes } : data;
    const fleetIds = Array.isArray(detail?.fleet_ids)
      ? detail.fleet_ids.filter((id) => typeof id === "string" || typeof id === "number").map(String)
      : [];

    if (!fleetIds.length) return { fleetIds, error: "vAMSYS no devolvió flotas compatibles para esta ruta." };
    return { fleetIds, error: null };
  } catch (error) {
    return { fleetIds: [] as string[], error: error instanceof Error ? error.message : "No se pudieron consultar las flotas de la ruta." };
  }
}

const text = (data: FormData, name: string) => String(data.get(name) ?? "").trim();
const optional = (data: FormData, name: string) => text(data, name) || null;
const integer = (data: FormData, name: string) => {
  const value = text(data, name);
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${name} debe ser un número entero.`);
  return parsed;
};
const date = (data: FormData, name: string, required = false) => {
  const value = text(data, name);
  if (!value && !required) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`La fecha ${name} no es válida.`);
  return parsed;
};

function done(type: "success" | "error", message: string): never {
  redirect(`/staff/flight-offers?${type}=${encodeURIComponent(message)}`);
}

export async function createFlightOfferAction(formData: FormData) {
  let feedback: { type: "success" | "error"; message: string };
  try {
    const staff = await requireStaffPermission("FLIGHT_OFFER_MANAGE", { entityType: "FlightOffer", attemptedAction: "crear una oferta de vuelo" });
    const title = text(formData, "title");
    const departureIcao = text(formData, "departureIcao").toUpperCase();
    const arrivalIcao = text(formData, "arrivalIcao").toUpperCase();
    const vamsysRouteId = text(formData, "vamsysRouteId");
    const vamsysAircraftId = text(formData, "vamsysAircraftId");
    if (!title || !/^[A-Z0-9]{4}$/.test(departureIcao) || !/^[A-Z0-9]{4}$/.test(arrivalIcao)) throw new Error("Completa el título y los ICAO de salida/llegada.");
    if (!/^\d+$/.test(vamsysRouteId) || !/^\d+$/.test(vamsysAircraftId)) throw new Error("route_id y aircraft_id deben ser IDs numéricos de vAMSYS.");
    const rewardEuros = Number((text(formData, "reward") || "0").replace(",", "."));
    if (!Number.isFinite(rewardEuros) || rewardEuros < 0) throw new Error("La recompensa no es válida.");
    const rewardType = text(formData, "rewardType") === "PERCENTAGE" ? "PERCENTAGE" : "FIXED";
    const offer = await prisma.flightOffer.create({ data: {
      title,
      flightNumber: optional(formData, "flightNumber"), callsign: optional(formData, "callsign"),
      departureIcao, arrivalIcao, vamsysRouteId, vamsysAircraftId,
      vamsysFleetId: optional(formData, "vamsysFleetId"),
      scheduledDeparture: date(formData, "scheduledDeparture", true)!, scheduledArrival: date(formData, "scheduledArrival"),
      aircraftType: optional(formData, "aircraftType")?.toUpperCase() ?? null,
      aircraftRegistration: optional(formData, "aircraftRegistration")?.toUpperCase() ?? null,
      passengers: integer(formData, "passengers"), cargoKg: integer(formData, "cargoKg"), altitude: integer(formData, "altitude"),
      network: optional(formData, "network"), userRoute: optional(formData, "userRoute"),
      rewardType,
      rewardCents: rewardType === "FIXED" ? Math.round(rewardEuros * 100) : Math.round(rewardEuros * 100),
      validUntil: date(formData, "validUntil", true)!, createdByStaffId: staff.id,
    } });
    await prisma.aocAuditLog.create({ data: { staffUserId: staff.id, action: "FLIGHT_OFFER_CREATED", entityType: "FlightOffer", entityId: offer.id, message: `${staff.name} creó la oferta ${offer.title}.`, metadata: { route: `${departureIcao}-${arrivalIcao}` } } });
    revalidatePath("/staff/flight-offers"); revalidatePath("/pilot/flight-offers");
    feedback = { type: "success", message: "Oferta creada como borrador." };
  } catch (error) { feedback = { type: "error", message: error instanceof Error ? error.message : "No se pudo crear la oferta." }; }
  done(feedback.type, feedback.message);
}

async function changeStatus(formData: FormData, status: "PUBLISHED" | "CANCELLED") {
  const id = text(formData, "id");
  const staff = await requireStaffPermission("FLIGHT_OFFER_MANAGE", { entityType: "FlightOffer", entityId: id, attemptedAction: `${status} oferta` });
  const current = await prisma.flightOffer.findUnique({ where: { id }, include: { dispatches: true } });
  if (!current) throw new Error("La oferta no existe.");
  if (status === "PUBLISHED" && current.status !== "DRAFT") throw new Error("Solo se pueden publicar ofertas en borrador.");
  if (status === "CANCELLED" && current.dispatches.length > 0) throw new Error("No se puede cancelar una oferta que ya tiene dispatch.");
  await prisma.flightOffer.update({ where: { id }, data: { status } });
  await prisma.aocAuditLog.create({ data: { staffUserId: staff.id, action: `FLIGHT_OFFER_${status}`, entityType: "FlightOffer", entityId: id, message: `${staff.name} cambió ${current.title} a ${status}.` } });
  revalidatePath("/staff/flight-offers"); revalidatePath("/pilot/flight-offers");
}

export async function publishFlightOfferAction(formData: FormData) {
  let feedback: { type: "success" | "error"; message: string };
  try { await changeStatus(formData, "PUBLISHED"); feedback = { type: "success", message: "Oferta publicada." }; }
  catch (error) { feedback = { type: "error", message: error instanceof Error ? error.message : "No se pudo publicar." }; }
  done(feedback.type, feedback.message);
}

export async function cancelFlightOfferAction(formData: FormData) {
  let feedback: { type: "success" | "error"; message: string };
  try { await changeStatus(formData, "CANCELLED"); feedback = { type: "success", message: "Oferta cancelada." }; }
  catch (error) { feedback = { type: "error", message: error instanceof Error ? error.message : "No se pudo cancelar." }; }
  done(feedback.type, feedback.message);
}

export async function reopenFailedFlightOfferAction(formData: FormData) {
  let feedback: { type: "success" | "error"; message: string };
  try {
    const id = text(formData, "id");
    const staff = await requireStaffPermission("FLIGHT_OFFER_MANAGE", { entityType: "FlightOffer", entityId: id, attemptedAction: "reabrir una oferta fallida" });
    const offer = await prisma.flightOffer.findUnique({ where: { id }, include: { dispatches: true } });
    const dispatch = offer?.dispatches[0];
    if (!offer || !dispatch || dispatch.status !== "FAILED") throw new Error("Solo se pueden reabrir ofertas con dispatch fallido.");
    await prisma.$transaction([
      prisma.flightDispatch.delete({ where: { id: dispatch.id } }),
      prisma.flightOffer.update({ where: { id }, data: { status: "PUBLISHED" } }),
    ]);
    await prisma.aocAuditLog.create({ data: { staffUserId: staff.id, action: "FLIGHT_OFFER_REOPENED", entityType: "FlightOffer", entityId: id, message: `${staff.name} reabrió ${offer.title} después de un dispatch fallido.`, metadata: { previousError: dispatch.errorMessage?.slice(0, 300) ?? null } } });
    revalidatePath("/staff/flight-offers"); revalidatePath("/pilot/flight-offers");
    feedback = { type: "success", message: "Oferta reabierta. Corrige los datos antes de volver a hacer Dispatch." };
  } catch (error) {
    feedback = { type: "error", message: error instanceof Error ? error.message : "No se pudo reabrir la oferta." };
  }
  done(feedback.type, feedback.message);
}
