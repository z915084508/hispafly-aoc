"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePilotSession } from "@/lib/pilot/session";
import { cancelPilotBooking, preparePilotBooking } from "@/lib/pilotBookings/service";
import { prisma } from "@/lib/prisma";
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
    const dispatch = await preparePilotBooking(pilot.id, {
      routeId: String(formData.get("routeId") ?? ""),
      fleetId: String(formData.get("fleetId") ?? "") || null,
      aircraftId: String(formData.get("aircraftId") ?? ""),
      departureAt: new Date(String(formData.get("departureAt") ?? "")),
      network: String(formData.get("network") ?? "vatsim"),
      callsign: String(formData.get("callsign") ?? "") || null,
      altitude: optionalInt(formData.get("altitude")),
      loadFactorPercent: Number(formData.get("loadFactorPercent")),
      baggageKgPerPassenger: Number(formData.get("baggageKgPerPassenger")),
      freightKg: optionalInt(formData.get("freightKg")),
      userRoute: String(formData.get("userRoute") ?? "") || null,
    });
    const ofp = await prisma.ofpBriefing.findUnique({ where: { flightDispatchId: dispatch.id }, select: { id: true } });
    if (!ofp) throw new Error("OFP creation failed.");
    revalidatePath("/pilot/bookings"); revalidatePath("/pilot/ofp");
    redirect(`/pilot/ofp/${ofp.id}?success=${encodeURIComponent("Flight prepared. Generate and sign the OFP before Final Dispatch.")}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect("/pilot/bookings?error=" + encodeURIComponent(error instanceof Error ? error.message : "No se pudo crear el booking."));
  }
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
