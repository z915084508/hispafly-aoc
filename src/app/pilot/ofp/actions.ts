"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePilotSession } from "@/lib/pilot/session";
import { generateDispatchSimBriefOfp } from "@/lib/simbrief/ofp";
import { writeAuditLogSafely } from "@/lib/audit/log";
import { evaluateDispatchRelease } from "@/lib/dispatch-release/service";
import { releaseNativeDispatch } from "@/lib/native-flight/dispatch";

export async function generateSimbriefOFPAction(formData: FormData) {
  const pilot = await requirePilotSession();
  const ofpId = String(formData.get("ofpId") ?? "");
  const alternateIcao = String(formData.get("alternateIcao") ?? "").trim().toUpperCase() || null;
  let error: string | null = null;
  try {
    await generateDispatchSimBriefOfp({ ofpId, pilotId: pilot.id, alternateIcao });
    revalidatePath(`/pilot/ofp/${ofpId}`); revalidatePath("/pilot/ofp"); revalidatePath("/staff/ofp");
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "OFP generation failed.";
  }
  redirect(`/pilot/ofp/${ofpId}?${error ? `error=${encodeURIComponent(error)}` : `success=${encodeURIComponent(alternateIcao ? `OFP regenerated with alternate ${alternateIcao}. Review and sign again.` : "OFP generated.")}`}`);
}

export async function signOFPAction(formData: FormData) {
  const pilot = await requirePilotSession(); const ofpId = String(formData.get("ofpId") ?? ""); const signatureData = String(formData.get("signatureData") ?? "");
  if (formData.get("accepted") !== "yes" || !signatureData.startsWith("data:image/png;base64,") || signatureData.length > 500_000) redirect(`/pilot/ofp/${ofpId}?error=${encodeURIComponent("A valid signature and acceptance are required.")}`);
  const ofp = await prisma.ofpBriefing.findFirst({ where: { id: ofpId, flightDispatch: { pilotId: pilot.id } }, include: { flightDispatch: true } });
  if (!ofp || ofp.status !== "AWAITING_SIGNATURE") redirect(`/pilot/ofp/${ofpId}?error=${encodeURIComponent("Upload the generated SimBrief OFP before signing.")}`);
  await prisma.ofpBriefing.update({ where: { id: ofp.id }, data: { status: "SIGNED", signedByPilotId: pilot.id, signedByName: pilot.displayName, signedByCallsign: pilot.callsign, signatureData, acceptanceText: "Route, fuel, payload and alternates reviewed and accepted for HISPAFLY virtual operations.", signedAt: new Date() } });
  await evaluateDispatchRelease({ ofpBriefingId: ofp.id, markSignature: true, releasedByPilotId: pilot.id });
  await writeAuditLogSafely({ action: "OFP_SIGNED_BY_PILOT", entityType: "OfpBriefing", entityId: ofp.id, message: `${pilot.displayName} signed OFP version ${ofp.version}.`, metadata: { pilotId: pilot.id, dispatchId: ofp.flightDispatchId, contentHash: ofp.contentHash } });
  let releaseError: string | null = null;
  if (ofp.flightDispatch.dataOrigin === "HISPAFLY_NATIVE") {
    try {
      await releaseNativeDispatch({ dispatchId: ofp.flightDispatchId, actorType: "PILOT", actorId: pilot.id, actorName: pilot.displayName, acknowledgedWarnings: ["Pilot accepted all current Dispatch Release warnings when signing the OFP."], comment: "OFP signed and Dispatch released in one pilot action." });
    } catch (error) {
      releaseError = error instanceof Error ? error.message : "Final Dispatch Release failed.";
    }
  }
  revalidatePath(`/pilot/ofp/${ofp.id}`); revalidatePath("/pilot/ofp"); revalidatePath("/staff/ofp"); revalidatePath(`/pilot/dispatch/${ofp.flightDispatchId}`);
  redirect(`/pilot/ofp/${ofp.id}?${releaseError ? `error=${encodeURIComponent(`OFP signed, but release is blocked: ${releaseError}`)}` : `success=${encodeURIComponent(ofp.flightDispatch.dataOrigin === "HISPAFLY_NATIVE" ? "OFP signed and flight released. ACARS assignment is ready." : "OFP signed and uploaded to AOC.")}`}`);
}

export async function finalizeSignedOFPAction(formData: FormData) {
  const pilot = await requirePilotSession();
  const ofpId = String(formData.get("ofpId") ?? "");
  const ofp = await prisma.ofpBriefing.findFirst({ where: { id: ofpId, status: "SIGNED", flightDispatch: { pilotId: pilot.id, dataOrigin: "HISPAFLY_NATIVE" } }, include: { flightDispatch: true } });
  if (!ofp) redirect(`/pilot/ofp/${ofpId}?error=${encodeURIComponent("Signed Native OFP not found.")}`);
  try {
    await releaseNativeDispatch({ dispatchId: ofp.flightDispatchId, actorType: "PILOT", actorId: pilot.id, actorName: pilot.displayName, acknowledgedWarnings: ["Pilot reconfirmed the current Dispatch Release warnings."], comment: "Final release retried from signed OFP." });
    revalidatePath(`/pilot/ofp/${ofp.id}`); revalidatePath(`/pilot/dispatch/${ofp.flightDispatchId}`);
  } catch (error) {
    redirect(`/pilot/ofp/${ofp.id}?error=${encodeURIComponent(error instanceof Error ? error.message : "Final Dispatch Release failed.")}`);
  }
  redirect(`/pilot/ofp/${ofp.id}?success=${encodeURIComponent("Flight released. ACARS assignment is ready.")}`);
}
