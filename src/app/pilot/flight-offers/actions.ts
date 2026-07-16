"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePilotSession } from "@/lib/pilot/session";
import { createNativeBooking } from "@/lib/native-flight/booking";
import { writeAuditLogSafely } from "@/lib/audit/log";
import { cancelFlightDispatchByPilot } from "@/lib/flightOffers/service";

export async function bookNativeFlightAction(formData: FormData) {
  const pilot = await requirePilotSession();
  const flightId = String(formData.get("flightId") ?? "");
  try {
    const booking = await createNativeBooking({
      pilotId: pilot.id,
      flightId,
      aircraftId: String(formData.get("aircraftId") ?? "") || null,
      idempotencyKey: String(formData.get("idempotencyKey") ?? ""),
    });
    await writeAuditLogSafely({ action: "PILOT_BOOKING_CREATED", entityType: "PilotBooking", entityId: booking.id, message: "Pilot created a native booking.", metadata: { pilotId: pilot.id, flightId } });
    revalidatePath("/pilot/flight-offers");
    revalidatePath("/pilot/bookings");
    redirect(`/pilot/bookings/${booking.id}?success=Booking+confirmed`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect(`/pilot/flight-offers/${flightId}?error=${encodeURIComponent(error instanceof Error ? error.message : "Booking failed")}`);
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
