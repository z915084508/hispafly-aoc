"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePilotSession } from "@/lib/pilot/session";
import { dispatchFlightOffer } from "@/lib/flightOffers/service";

export async function dispatchFlightOfferAction(formData: FormData) {
  const pilot = await requirePilotSession();
  const offerId = String(formData.get("offerId") ?? "");
  try {
    await dispatchFlightOffer(offerId, pilot.id);
    revalidatePath("/pilot/flight-offers"); revalidatePath("/staff/flight-offers");
  } catch (error) {
    redirect("/pilot/flight-offers?error=" + encodeURIComponent(error instanceof Error ? error.message : "No se pudo realizar el dispatch."));
  }
  redirect("/pilot/flight-offers?success=" + encodeURIComponent("Booking creado correctamente en vAMSYS."));
}
