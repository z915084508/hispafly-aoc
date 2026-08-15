"use server";
import { NativeFlightStatus, PilotBookingStatus } from "@prisma/client";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStaffPermission } from "@/lib/staff/authorization";
import { cancelOrVoidNativeDispatch, releaseNativeDispatch, runNativeDispatchChecks } from "@/lib/native-flight/dispatch";
import { writeAuditLogSafely } from "@/lib/audit/log";
import { prisma } from "@/lib/prisma";

async function closeCancelledPilotOperation(dispatchId: string, reason: string, releaseStatus: "CANCELLED" | "VOIDED") {
  const dispatch = await prisma.flightDispatch.findUnique({
    where: { id: dispatchId },
    include: { flight: true, ofpBriefing: true },
  });
  if (!dispatch?.bookingId) return;

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.pilotBooking.update({
      where: { id: dispatch.bookingId! },
      data: { status: PilotBookingStatus.CANCELLED, cancelledAt: now, cancellationReason: reason },
    });

    if (dispatch.flightId && dispatch.flight) {
      if (dispatch.flight.scheduleId && dispatch.flight.scheduledDeparture > now) {
        const status = dispatch.flight.bookingOpenAt && dispatch.flight.bookingOpenAt > now
          ? NativeFlightStatus.SCHEDULED
          : dispatch.flight.bookingCloseAt && dispatch.flight.bookingCloseAt <= now
            ? NativeFlightStatus.EXPIRED
            : NativeFlightStatus.OPEN_FOR_BOOKING;
        await tx.flight.update({ where: { id: dispatch.flightId }, data: { status } });
      } else {
        await tx.flight.update({ where: { id: dispatch.flightId }, data: { status: NativeFlightStatus.CANCELLED } });
      }
    }

    await tx.flightOffer.updateMany({ where: { id: dispatch.flightOfferId }, data: { status: "CANCELLED" } });
    if (dispatch.ofpBriefing) {
      await tx.dispatchRelease.updateMany({ where: { ofpBriefingId: dispatch.ofpBriefing.id }, data: { status: releaseStatus } });
    }
  });

  revalidatePath("/pilot/bookings");
  revalidatePath(`/pilot/bookings/${dispatch.bookingId}`);
  revalidatePath("/pilot/ofp");
  revalidatePath("/pilot/roster");
}

export async function staffRunDispatchChecksAction(formData: FormData) {
  const id=String(formData.get("dispatchId")),staff=await requireStaffPermission("DISPATCH_RUN_CHECKS",{entityType:"FlightDispatch",entityId:id,attemptedAction:"run Dispatch checks"}),result=await runNativeDispatchChecks(id);
  await writeAuditLogSafely({staffUserId:staff.id,action:"STAFF_DISPATCH_CHECKS_RUN",entityType:"FlightDispatch",entityId:id,message:`${staff.name} ran Dispatch checks.`,metadata:{riskLevel:result.riskLevel,blocks:result.blockingItems.length}});revalidatePath(`/staff/dispatch/${id}`);
}
export async function staffReleaseDispatchAction(formData: FormData) {
  const id=String(formData.get("dispatchId")),staff=await requireStaffPermission("DISPATCH_RELEASE",{entityType:"FlightDispatch",entityId:id,attemptedAction:"release Dispatch"});
  try{await releaseNativeDispatch({dispatchId:id,actorType:"STAFF",actorId:staff.id,actorName:staff.name,acknowledgedWarnings:formData.getAll("warning").map(String),comment:String(formData.get("comment")??"")});await writeAuditLogSafely({staffUserId:staff.id,action:"STAFF_DISPATCH_RELEASED",entityType:"FlightDispatch",entityId:id,message:`${staff.name} released Dispatch.`});redirect(`/staff/dispatch/${id}?success=Dispatch+released`)}catch(error){if(error&&typeof error==="object"&&"digest"in error)throw error;redirect(`/staff/dispatch/${id}?error=${encodeURIComponent(error instanceof Error?error.message:"Release failed")}`)}
}

export async function staffCancelDispatchAction(formData: FormData) {
  const id = String(formData.get("dispatchId"));
  const reason = String(formData.get("reason") ?? "");
  const staff = await requireStaffPermission("DISPATCH_EDIT", { entityType: "FlightDispatch", entityId: id, attemptedAction: "cancel Dispatch" });
  try {
    await cancelOrVoidNativeDispatch(id, "CANCEL", reason);
    await closeCancelledPilotOperation(id, reason, "CANCELLED");
    await writeAuditLogSafely({ staffUserId: staff.id, action: "STAFF_DISPATCH_CANCELLED", entityType: "FlightDispatch", entityId: id, message: `${staff.name} cancelled Dispatch.`, metadata: { reason } });
    revalidatePath(`/staff/dispatch/${id}`);
    redirect(`/staff/dispatch/${id}?success=Dispatch+cancelled`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect(`/staff/dispatch/${id}?error=${encodeURIComponent(error instanceof Error ? error.message : "Cancellation failed")}`);
  }
}

export async function staffVoidDispatchAction(formData: FormData) {
  const id = String(formData.get("dispatchId"));
  const reason = String(formData.get("reason") ?? "");
  const staff = await requireStaffPermission("DISPATCH_VOID", { entityType: "FlightDispatch", entityId: id, attemptedAction: "void Dispatch" });
  try {
    await cancelOrVoidNativeDispatch(id, "VOID", reason);
    await closeCancelledPilotOperation(id, reason, "VOIDED");
    await writeAuditLogSafely({ staffUserId: staff.id, action: "STAFF_DISPATCH_VOIDED", entityType: "FlightDispatch", entityId: id, message: `${staff.name} voided Dispatch.`, metadata: { reason } });
    revalidatePath(`/staff/dispatch/${id}`);
    redirect(`/staff/dispatch/${id}?success=Dispatch+voided`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect(`/staff/dispatch/${id}?error=${encodeURIComponent(error instanceof Error ? error.message : "Void failed")}`);
  }
}
