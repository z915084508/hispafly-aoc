"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStaffPermission } from "@/lib/staff/authorization";
import { cancelOrVoidNativeDispatch, releaseNativeDispatch, runNativeDispatchChecks } from "@/lib/native-flight/dispatch";
import { writeAuditLogSafely } from "@/lib/audit/log";
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
    await writeAuditLogSafely({ staffUserId: staff.id, action: "STAFF_DISPATCH_VOIDED", entityType: "FlightDispatch", entityId: id, message: `${staff.name} voided Dispatch.`, metadata: { reason } });
    revalidatePath(`/staff/dispatch/${id}`);
    redirect(`/staff/dispatch/${id}?success=Dispatch+voided`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect(`/staff/dispatch/${id}?error=${encodeURIComponent(error instanceof Error ? error.message : "Void failed")}`);
  }
}
