"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePilotSession } from "@/lib/pilot/session";
import { prisma } from "@/lib/prisma";
import { cancelFlightDispatchByPilot, prepareFlightOffer } from "@/lib/flightOffers/service";

export async function dispatchFlightOfferAction(formData: FormData) {
  const pilot = await requirePilotSession();
  const offerId = String(formData.get("offerId") ?? "");
  const selectedDepartureAt = new Date(String(formData.get("selectedDepartureAt") ?? ""));
  let dispatchId: string;
  try {
    const dispatch = await prepareFlightOffer(offerId, pilot.id, selectedDepartureAt); dispatchId = dispatch.id;
    revalidatePath("/pilot/flight-offers"); revalidatePath("/staff/flight-offers");
  } catch (error) {
    redirect("/pilot/flight-offers?error=" + encodeURIComponent(error instanceof Error ? error.message : "No se pudo realizar el dispatch."));
  }
  const briefing = await prisma.ofpBriefing.findUnique({ where: { flightDispatchId: dispatchId }, select: { id: true } });
  redirect(briefing ? `/pilot/ofp/${briefing.id}?success=${encodeURIComponent("Flight claimed. Generate and sign the OFP before Final Dispatch.")}` : "/pilot/flight-offers?error=OFP+creation+failed");
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
  redirect("/pilot/flight-offers?success=" + encodeURIComponent("Flight cancelled. Pre-dispatch cancellations have no penalty; a penalty only applies after a vAMSYS booking exists."));
}
