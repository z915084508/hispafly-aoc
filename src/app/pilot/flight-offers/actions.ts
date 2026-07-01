"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePilotSession } from "@/lib/pilot/session";
import { cancelFlightDispatchByPilot, dispatchFlightOffer } from "@/lib/flightOffers/service";

export async function dispatchFlightOfferAction(formData: FormData) {
  const pilot = await requirePilotSession();
  const offerId = String(formData.get("offerId") ?? "");
  const selectedDepartureAt = new Date(String(formData.get("selectedDepartureAt") ?? ""));
  let dispatchId: string;
  try {
    const dispatch = await dispatchFlightOffer(offerId, pilot.id, selectedDepartureAt); dispatchId = dispatch.id;
    revalidatePath("/pilot/flight-offers"); revalidatePath("/staff/flight-offers");
  } catch (error) {
    redirect("/pilot/flight-offers?error=" + encodeURIComponent(error instanceof Error ? error.message : "No se pudo realizar el dispatch."));
  }
  redirect(`/pilot/flight-offers?success=${encodeURIComponent("Booking creado correctamente en vAMSYS.")}&dispatchId=${encodeURIComponent(dispatchId)}`);
}

export async function cancelFlightDispatchAction(formData: FormData) {
  const pilot = await requirePilotSession();
  const dispatchId = String(formData.get("dispatchId") ?? "");
  try {
    await cancelFlightDispatchByPilot(dispatchId, pilot.id);
    revalidatePath("/pilot/flight-offers"); revalidatePath("/pilot/wallet"); revalidatePath("/staff/flight-offers");
  } catch (error) {
    redirect("/pilot/flight-offers?error=" + encodeURIComponent(error instanceof Error ? error.message : "No se pudo cancelar el dispatch."));
  }
  redirect("/pilot/flight-offers?success=" + encodeURIComponent("Booking cancelado. Se descontaron 50 € y la oferta volvió a estar disponible."));
}
