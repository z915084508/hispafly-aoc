"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePilotSession } from "@/lib/pilot/session";
import { prisma } from "@/lib/prisma";
import { normalizeSimbriefUserId } from "@/lib/simbrief/userId";
import { writeAuditLogSafely } from "@/lib/audit/log";

export async function savePilotSimbriefIdAction(formData: FormData) {
  const pilot = await requirePilotSession();
  const requestedReturnTo = String(formData.get("returnTo") ?? "/pilot/dashboard");
  const returnTo = /^\/pilot(?:\/|$)/.test(requestedReturnTo) && !requestedReturnTo.startsWith("//") ? requestedReturnTo : "/pilot/dashboard";
  let result = "saved";
  try {
    const simbriefUserId = normalizeSimbriefUserId(formData.get("simbriefUserId"));
    await prisma.pilot.update({ where: { id: pilot.id }, data: { simbriefUserId } });
    await writeAuditLogSafely({ action: "PILOT_SIMBRIEF_ID_UPDATED", entityType: "Pilot", entityId: pilot.id, message: `${pilot.displayName} updated their SimBrief Pilot ID.`, metadata: { configured: Boolean(simbriefUserId) } });
    revalidatePath("/pilot/dashboard"); revalidatePath("/pilot/ofp"); revalidatePath(returnTo);
  } catch { result = "invalid"; }
  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}simbrief=${result}`);
}
