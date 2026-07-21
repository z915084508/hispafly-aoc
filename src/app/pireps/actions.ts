"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaffPermission } from "@/lib/staff/authorization";

function finish(type: "success" | "error", message: string): never {
  revalidatePath("/");
  revalidatePath("/pireps");
  redirect(`/pireps?${type}=${encodeURIComponent(message)}`);
}

export async function syncAllPireps() {
  await requireStaffPermission("PIREP_SYNC", {
    entityType: "Pirep",
    attemptedAction: "attempt disabled historical synchronization",
  });
  finish("error", "External PIREP synchronization is permanently disabled. New PIREPs must be created by HispaFly ACARS.");
}
