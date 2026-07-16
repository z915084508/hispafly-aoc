"use server";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePilotSession } from "@/lib/pilot/session";
import { createNativeDispatch, releaseNativeDispatch, runNativeDispatchChecks } from "@/lib/native-flight/dispatch";
import { createDispatchOfpBriefing } from "@/lib/simbrief/ofp";
import { writeAuditLogSafely } from "@/lib/audit/log";
import { prisma } from "@/lib/prisma";

async function requireOwnedDispatch(dispatchId: string, pilotId: string) {
  const dispatch = await prisma.flightDispatch.findFirst({
    where: { id: dispatchId, pilotId, dataOrigin: "HISPAFLY_NATIVE" },
    select: { id: true },
  });
  if (!dispatch) throw new Error("Dispatch not found or is not assigned to this Pilot.");
}
export async function createPilotDispatchAction(formData: FormData) {
  const pilot = await requirePilotSession();
  try {
    const dispatch = await createNativeDispatch({ bookingId: String(formData.get("bookingId")), aircraftId: String(formData.get("aircraftId") ?? "") || null, actorPilotId: pilot.id, idempotencyKey: String(formData.get("idempotencyKey") ?? randomUUID()) });
    await createDispatchOfpBriefing(dispatch.id);
    await writeAuditLogSafely({ action: "NATIVE_DISPATCH_CREATED", entityType: "FlightDispatch", entityId: dispatch.id, message: `${pilot.displayName} created Native Dispatch.`, metadata: { pilotId: pilot.id, bookingId: dispatch.bookingId } });
    redirect(`/pilot/dispatch/${dispatch.id}`);
  } catch (error) { if (error && typeof error === "object" && "digest" in error) throw error; redirect(`/pilot/bookings/${String(formData.get("bookingId"))}?error=${encodeURIComponent(error instanceof Error ? error.message : "Dispatch creation failed")}`); }
}
export async function runPilotDispatchChecksAction(formData: FormData) {
  const pilot = await requirePilotSession(), id = String(formData.get("dispatchId"));
  await requireOwnedDispatch(id, pilot.id);
  const result = await runNativeDispatchChecks(id);
  await writeAuditLogSafely({ action: "NATIVE_DISPATCH_CHECKS_RUN", entityType: "FlightDispatch", entityId: id, message: `${pilot.displayName} ran Dispatch checks.`, metadata: { riskLevel: result.riskLevel, blocks: result.blockingItems.length } });
  revalidatePath(`/pilot/dispatch/${id}`);
}
export async function releasePilotDispatchAction(formData: FormData) {
  const pilot = await requirePilotSession(), id = String(formData.get("dispatchId"));
  try { await requireOwnedDispatch(id, pilot.id); await releaseNativeDispatch({ dispatchId: id, actorType: "PILOT", actorId: pilot.id, actorName: pilot.displayName, acknowledgedWarnings: formData.getAll("warning").map(String), comment: String(formData.get("comment") ?? "") }); await writeAuditLogSafely({ action: "NATIVE_DISPATCH_RELEASED", entityType: "FlightDispatch", entityId: id, message: `${pilot.displayName} released Native Dispatch.` }); revalidatePath(`/pilot/dispatch/${id}`); redirect(`/pilot/dispatch/${id}?success=Dispatch+released`); }
  catch (error) { if (error && typeof error === "object" && "digest" in error) throw error; redirect(`/pilot/dispatch/${id}?error=${encodeURIComponent(error instanceof Error ? error.message : "Release failed")}`); }
}
