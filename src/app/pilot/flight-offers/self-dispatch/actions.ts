"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePilotSession } from "@/lib/pilot/session";
import { createNativeSelfDispatch } from "@/lib/native-flight/self-dispatch";

export async function createNativeSelfDispatchAction(formData: FormData) {
  const pilot = await requirePilotSession();
  const rawDeparture = String(formData.get("departureAt") ?? "");
  try {
    const booking = await createNativeSelfDispatch({
      pilotId: pilot.id, routeId: String(formData.get("routeId") ?? ""), aircraftId: String(formData.get("aircraftId") ?? ""),
      departureAt: new Date(`${rawDeparture}:00Z`), idempotencyKey: String(formData.get("idempotencyKey") ?? ""),
    });
    revalidatePath("/pilot/flight-offers"); revalidatePath("/pilot/bookings");
    redirect(`/pilot/bookings/${booking.id}?success=Self-dispatch+booking+created`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect(`/pilot/flight-offers/self-dispatch?error=${encodeURIComponent(error instanceof Error ? error.message : "Self-dispatch failed")}`);
  }
}
