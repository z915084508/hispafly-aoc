"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePilotSession } from "@/lib/pilot/session";
import { createNativeBooking } from "@/lib/native-flight/booking";
import { acceptAircraftDelivery } from "@/lib/native-flight/delivery-crew";
import { cancelFlightDispatchByPilot } from "@/lib/flightOffers/service";

export async function bookNativeFlightAction(formData: FormData) {
  const pilot = await requirePilotSession();
  const flightId = String(formData.get("flightId") ?? "");
  try {
    await createNativeBooking({
      pilotId: pilot.id,
      flightId,
      aircraftId: String(formData.get("aircraftId") ?? "") || null,
      idempotencyKey: String(formData.get("idempotencyKey") ?? ""),
    });
    revalidatePath("/pilot/flight-offers");
    revalidatePath("/pilot/bookings");
    revalidatePath("/pilot/roster");
    redirect("/pilot/roster?success=Flight+reserved");
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect(`/pilot/flight-offers/${flightId}?error=${encodeURIComponent(error instanceof Error ? error.message : "Booking failed")}`);
  }
}

export async function acceptAircraftDeliveryAction(formData: FormData) {
  const pilot = await requirePilotSession();
  const aircraftId = String(formData.get("aircraftId") ?? "");
  const rawDeparture = String(formData.get("departureAtUtc") ?? "").trim();
  const departureAt = new Date(rawDeparture.endsWith("Z") ? rawDeparture : `${rawDeparture}:00Z`);
  try {
    const result = await acceptAircraftDelivery({ pilotId: pilot.id, aircraftId, departureAt });
    revalidatePath("/pilot/flight-offers");
    revalidatePath("/pilot/bookings");
    revalidatePath("/pilot/roster");
    revalidatePath("/pilot/profile");
    const message = result.repositioned
      ? "Delivery accepted. Company Jumpseat completed at EUR 0.00; Pilot Wallet unchanged."
      : result.alreadyAccepted
        ? "This delivery is already assigned to you."
        : "Delivery accepted. You are already at the delivery airport; no Jumpseat was required.";
    redirect(`/pilot/bookings/${result.booking.id}?success=${encodeURIComponent(message)}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect(`/pilot/flight-offers?error=${encodeURIComponent(error instanceof Error ? error.message : "Delivery acceptance failed")}`);
  }
}

export async function dispatchFlightOfferAction(formData: FormData) {
  const flightId = String(formData.get("flightId") ?? formData.get("offerId") ?? "");
  redirect(`/pilot/flight-offers/${flightId}?error=Legacy+offer+dispatch+is+disabled.+Choose+a+Native+Flight.`);
}

export async function cancelFlightDispatchAction(formData: FormData) {
  const pilot = await requirePilotSession();
  try {
    await cancelFlightDispatchByPilot(String(formData.get("dispatchId") ?? ""), pilot.id);
    revalidatePath("/pilot/ofp");
    redirect("/pilot/bookings?success=Dispatch+cancelled");
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect(`/pilot/bookings?error=${encodeURIComponent(error instanceof Error ? error.message : "Cancellation failed")}`);
  }
}
