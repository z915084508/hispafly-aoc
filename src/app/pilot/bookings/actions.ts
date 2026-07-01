"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePilotSession } from "@/lib/pilot/session";
import { cancelPilotBooking, createPilotBooking } from "@/lib/pilotBookings/service";
import { getOperationsRouteDetails } from "@/lib/flightOffers/options";

const optionalInt = (value: FormDataEntryValue | null) => {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = Number(text);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error("Los valores numéricos deben ser enteros positivos.");
  return parsed;
};

export async function getPilotRouteDetailsAction(routeId: string) {
  await requirePilotSession();
  try {
    const details = await getOperationsRouteDetails(routeId);
    return { ...details, error: details.fleetIds.length ? null : "vAMSYS no devolvió flotas compatibles para esta ruta." };
  } catch (error) {
    return { fleetIds: [] as string[], durationMinutes: null, error: error instanceof Error ? error.message : "No se pudo consultar la ruta." };
  }
}

export async function createPilotBookingAction(formData: FormData) {
  const pilot = await requirePilotSession();
  try {
    await createPilotBooking(pilot.id, {
      routeId: String(formData.get("routeId") ?? ""),
      fleetId: String(formData.get("fleetId") ?? "") || null,
      aircraftId: String(formData.get("aircraftId") ?? ""),
      departureAt: new Date(String(formData.get("departureAt") ?? "")),
      network: String(formData.get("network") ?? "vatsim"),
      callsign: String(formData.get("callsign") ?? "") || null,
      altitude: optionalInt(formData.get("altitude")),
      passengers: optionalInt(formData.get("passengers")),
      cargoKg: optionalInt(formData.get("cargoKg")),
      userRoute: String(formData.get("userRoute") ?? "") || null,
    });
    revalidatePath("/pilot/bookings");
  } catch (error) {
    redirect("/pilot/bookings?error=" + encodeURIComponent(error instanceof Error ? error.message : "No se pudo crear el booking."));
  }
  redirect("/pilot/bookings?success=" + encodeURIComponent("Booking creado correctamente en vAMSYS."));
}

export async function cancelPilotBookingAction(formData: FormData) {
  const pilot = await requirePilotSession();
  try {
    await cancelPilotBooking(String(formData.get("bookingId") ?? ""), pilot.id);
    revalidatePath("/pilot/bookings");
  } catch (error) {
    redirect("/pilot/bookings?error=" + encodeURIComponent(error instanceof Error ? error.message : "No se pudo cancelar el booking."));
  }
  redirect("/pilot/bookings?success=" + encodeURIComponent("Booking cancelado en vAMSYS sin penalización AOC."));
}
