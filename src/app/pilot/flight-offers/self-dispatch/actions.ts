"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePilotSession } from "@/lib/pilot/session";
import { createNativeSelfDispatch } from "@/lib/native-flight/self-dispatch";
import { createNativeDispatch } from "@/lib/native-flight/dispatch";
import { createDispatchOfpBriefing } from "@/lib/simbrief/ofp";
import { assertNavigraphConnected } from "@/lib/navigraph/token";
import { purchaseJumpseat } from "@/lib/pilot/position";

export async function purchaseJumpseatAction(formData: FormData) {
  const pilot = await requirePilotSession();
  try {
    const result = await purchaseJumpseat(pilot.id, String(formData.get("arrivalAirportId") ?? ""));
    revalidatePath("/pilot/flight-offers/self-dispatch"); revalidatePath("/pilot/dashboard"); revalidatePath("/pilot/wallet");
    redirect(`/pilot/flight-offers/self-dispatch?success=${encodeURIComponent(`Jumpseat complete. Crew position is now ${result.arrival.icao}.`)}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect(`/pilot/flight-offers/self-dispatch?error=${encodeURIComponent(error instanceof Error ? error.message : "Jumpseat failed")}`);
  }
}

export async function createNativeSelfDispatchAction(formData: FormData) {
  const pilot = await requirePilotSession();
  const rawDeparture = String(formData.get("departureAt") ?? "");
  let bookingId: string | null = null;
  try {
    await assertNavigraphConnected(pilot.id);
    const booking = await createNativeSelfDispatch({
      pilotId: pilot.id, routeId: String(formData.get("routeId") ?? ""), aircraftId: String(formData.get("aircraftId") ?? ""),
      departureAt: new Date(`${rawDeparture}:00Z`), idempotencyKey: String(formData.get("idempotencyKey") ?? ""),
      network: String(formData.get("network") ?? "vatsim"), altitude: Number(formData.get("altitude")) || null,
      loadFactorPercent: Number(formData.get("loadFactorPercent")), baggageKgPerPassenger: Number(formData.get("baggageKgPerPassenger")),
      freightKg: Math.round(Number(formData.get("freightKg")) || 0), userRoute: String(formData.get("userRoute") ?? "").trim() || null,
      acknowledgeLocationWarning: formData.get("acknowledgeLocationWarning") === "yes",
    });
    bookingId = booking.id;
    const dispatch = await createNativeDispatch({ bookingId: booking.id, aircraftId: booking.aircraftId, actorPilotId: pilot.id, idempotencyKey: `self-dispatch:${booking.id}` });
    const ofp = await createDispatchOfpBriefing(dispatch.id);
    revalidatePath("/pilot/flight-offers"); revalidatePath("/pilot/bookings");
    redirect(`/pilot/ofp/${ofp.id}?success=Operation+created.+Generate+the+SimBrief+OFP+when+ready`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    if (bookingId) redirect(`/pilot/bookings/${bookingId}?error=${encodeURIComponent(error instanceof Error ? error.message : "OFP preparation failed")}`);
    redirect(`/pilot/flight-offers/self-dispatch?error=${encodeURIComponent(error instanceof Error ? error.message : "Self-dispatch failed")}`);
  }
}
