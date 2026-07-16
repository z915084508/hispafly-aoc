"use server";
import type { AirportStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createNativeAirport, updateAirport, changeAirportStatus } from "@/lib/native-flight/airport";
import { requireStaffPermission } from "@/lib/staff/authorization";

const value = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const optionalNumber = (form: FormData, key: string) => value(form, key) === "" ? null : Number(value(form, key));
function input(form: FormData) {
  return {
    icao: value(form, "icao"), iata: value(form, "iata"), name: value(form, "name"),
    city: value(form, "city"), country: value(form, "country"), region: value(form, "region"),
    timezone: value(form, "timezone"), latitude: optionalNumber(form, "latitude"),
    longitude: optionalNumber(form, "longitude"),
  };
}

export async function createAirportAction(form: FormData) {
  let target = "/staff/airports/new";
  try {
    const staff = await requireStaffPermission("AIRPORT_CREATE", { entityType: "Airport", attemptedAction: "create airport" });
    const airport = await createNativeAirport(input(form), staff);
    target = `/staff/airports/${airport.id}?success=${encodeURIComponent("Airport created.")}`;
  } catch (error) {
    target += `?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to create airport.")}`;
  }
  redirect(target);
}

export async function updateAirportAction(form: FormData) {
  const id = value(form, "id"); let target = `/staff/airports/${id}`;
  try {
    const staff = await requireStaffPermission("AIRPORT_EDIT", { entityType: "Airport", entityId: id, attemptedAction: "edit airport" });
    await updateAirport(id, input(form), staff);
    revalidatePath("/staff/airports"); target += "?success=Airport%20updated.";
  } catch (error) {
    target += `?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to update airport.")}`;
  }
  redirect(target);
}

export async function changeAirportStatusAction(form: FormData) {
  const id = value(form, "id"), status = value(form, "status") as AirportStatus;
  const permission = status === "ARCHIVED" ? "AIRPORT_ARCHIVE" : "AIRPORT_EDIT";
  let target = `/staff/airports/${id}`;
  try {
    const staff = await requireStaffPermission(permission, { entityType: "Airport", entityId: id, attemptedAction: `${status.toLowerCase()} airport` });
    await changeAirportStatus(id, status, staff, value(form, "reason"));
    revalidatePath("/staff/airports"); target += "?success=Airport%20status%20updated.";
  } catch (error) {
    target += `?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to change airport status.")}`;
  }
  redirect(target);
}
