"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePilotSession } from "@/lib/pilot/session";
import { importSimbriefOfp } from "@/lib/simbrief/ofp";
import { writeAuditLogSafely } from "@/lib/audit/log";
import { finalDispatchFlightOffer } from "@/lib/flightOffers/service";

export async function importSimbriefOFPAction(formData: FormData) {
  const pilot = await requirePilotSession(); const ofpId = String(formData.get("ofpId") ?? ""); const userId = String(formData.get("simbriefUserId") ?? "").trim();
  let error: string | null = null;
  try { if (!/^\d+$/.test(userId)) throw new Error("Enter your numeric SimBrief Pilot ID."); await importSimbriefOfp(ofpId, pilot.id, userId); revalidatePath(`/pilot/ofp/${ofpId}`); }
  catch (caught) { error = caught instanceof Error ? caught.message : "Import failed."; }
  redirect(`/pilot/ofp/${ofpId}?${error ? `error=${encodeURIComponent(error)}` : `success=${encodeURIComponent("SimBrief OFP uploaded to AOC.")}`}`);
}

export async function signOFPAction(formData: FormData) {
  const pilot = await requirePilotSession(); const ofpId = String(formData.get("ofpId") ?? ""); const signatureData = String(formData.get("signatureData") ?? "");
  if (formData.get("accepted") !== "yes" || !signatureData.startsWith("data:image/png;base64,") || signatureData.length > 500_000) redirect(`/pilot/ofp/${ofpId}?error=${encodeURIComponent("A valid signature and acceptance are required.")}`);
  const ofp = await prisma.ofpBriefing.findFirst({ where: { id: ofpId, flightDispatch: { pilotId: pilot.id } }, include: { flightDispatch: true } });
  if (!ofp || ofp.status !== "AWAITING_SIGNATURE") redirect(`/pilot/ofp/${ofpId}?error=${encodeURIComponent("Upload the generated SimBrief OFP before signing.")}`);
  await prisma.ofpBriefing.update({ where: { id: ofp.id }, data: { status: "SIGNED", signedByPilotId: pilot.id, signedByName: pilot.displayName, signedByCallsign: pilot.callsign, signatureData, acceptanceText: "Route, fuel, payload and alternates reviewed and accepted for HISPAFLY virtual operations.", signedAt: new Date() } });
  await writeAuditLogSafely({ action: "OFP_SIGNED_BY_PILOT", entityType: "OfpBriefing", entityId: ofp.id, message: `${pilot.displayName} signed OFP version ${ofp.version}.`, metadata: { pilotId: pilot.id, dispatchId: ofp.flightDispatchId, contentHash: ofp.contentHash } });
  revalidatePath(`/pilot/ofp/${ofp.id}`); revalidatePath("/pilot/ofp"); revalidatePath("/staff/ofp"); redirect(`/pilot/ofp/${ofp.id}?success=${encodeURIComponent("OFP signed and uploaded to AOC.")}`);
}

export async function finalDispatchOFPAction(formData: FormData) {
  const pilot = await requirePilotSession(); const ofpId = String(formData.get("ofpId") ?? ""); const dispatchId = String(formData.get("dispatchId") ?? "");
  let resultId: string | null = null; let error: string | null = null;
  try { const dispatch = await finalDispatchFlightOffer(dispatchId, pilot.id); resultId = dispatch.vamsysBookingId; revalidatePath("/pilot/flight-offers"); revalidatePath("/pilot/ofp"); revalidatePath("/staff/flight-offers"); }
  catch (caught) { error = caught instanceof Error ? caught.message : "Final Dispatch failed."; }
  redirect(`/pilot/ofp/${ofpId}?${error ? `error=${encodeURIComponent(error)}` : `success=${encodeURIComponent(`Final Dispatch completed. vAMSYS Booking ${resultId}.`)}`}`);
}
