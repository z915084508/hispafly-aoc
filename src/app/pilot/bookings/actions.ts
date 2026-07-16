"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePilotSession } from "@/lib/pilot/session";
import { cancelNativeBooking } from "@/lib/native-flight/booking";

export async function cancelPilotBookingAction(formData: FormData) {
  const pilot = await requirePilotSession();
  const bookingId = String(formData.get("bookingId") ?? "");
  try {
    await cancelNativeBooking(bookingId, pilot.id, String(formData.get("reason") ?? "") || "Cancelled by pilot");
    revalidatePath("/pilot/bookings");
    redirect(`/pilot/bookings/${bookingId}?success=Booking+cancelled`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect(`/pilot/bookings/${bookingId}?error=${encodeURIComponent(error instanceof Error ? error.message : "Cancellation failed")}`);
  }
}

export async function getPilotRouteDetailsAction(_routeId?: string) {
  void _routeId;
  await requirePilotSession();
  return { fleetIds: [] as string[], durationMinutes: null, error: "Legacy route lookup is disabled. Choose a Native Flight." };
}

export async function createPilotBookingAction() {
  await requirePilotSession();
  redirect("/pilot/flight-offers?error=Choose+a+Native+Flight+before+booking");
}
