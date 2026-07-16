"use server";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStaffPermission } from "@/lib/staff/authorization";
import { executeReviewResolution, previewReviewResolution, refreshReviewQueue } from "@/lib/native-cutover/service";
import { writeAuditLogSafely } from "@/lib/audit/log";

export async function refreshCutoverReviewQueueAction() {
  const staff = await requireStaffPermission("NATIVE_CUTOVER_PREVIEW", { entityType: "NativeCutover", attemptedAction: "refresh cutover review queue" });
  const result = await refreshReviewQueue();
  await writeAuditLogSafely({ staffUserId: staff.id, action: "NATIVE_CUTOVER_QUEUE_REFRESHED", entityType: "NativeCutover", message: `${staff.name} refreshed Native cutover review queue.`, metadata: result });
  revalidatePath("/staff/native-cutover");
}

export async function previewCutoverResolutionAction(formData: FormData) {
  const id = String(formData.get("reviewItemId"));
  await requireStaffPermission("NATIVE_CUTOVER_PREVIEW", { entityType: "NativeCutoverReviewItem", entityId: id, attemptedAction: "preview cutover resolution" });
  const target = String(formData.get("targetNativeId") ?? "") || null;
  const decision = String(formData.get("decision")) as "CONFIRM" | "REJECT" | "HISTORICAL_ONLY";
  const preview = await previewReviewResolution(id, target, decision);
  redirect(`/staff/native-cutover/review/${id}?preview=${encodeURIComponent(JSON.stringify(preview))}`);
}

export async function executeCutoverResolutionAction(formData: FormData) {
  const id = String(formData.get("reviewItemId"));
  await requireStaffPermission("NATIVE_CUTOVER_EXECUTE", { entityType: "NativeCutoverReviewItem", entityId: id, attemptedAction: "execute cutover operation" });
  const staff = await requireStaffPermission("NATIVE_CUTOVER_RESOLVE", { entityType: "NativeCutoverReviewItem", entityId: id, attemptedAction: "resolve cutover item" });
  try {
    await executeReviewResolution({
      reviewItemId: id,
      targetNativeId: String(formData.get("targetNativeId") ?? "") || null,
      decision: String(formData.get("decision")) as "CONFIRM" | "REJECT" | "HISTORICAL_ONLY",
      note: String(formData.get("note") ?? ""),
      actorStaffId: staff.id,
      operationKey: String(formData.get("operationKey") ?? randomUUID()),
    });
    redirect(`/staff/native-cutover/review/${id}?success=Resolution+saved`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect(`/staff/native-cutover/review/${id}?error=${encodeURIComponent(error instanceof Error ? error.message : "Resolution failed")}`);
  }
}
