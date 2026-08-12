"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireStaffPermission } from "@/lib/staff/authorization";

export async function setAcarsBetaAccessAction(formData: FormData) {
  const pilotId = String(formData.get("pilotId") ?? "");
  const enabled = formData.get("enabled") === "true";
  const staff = await requireStaffPermission("ACARS_ACCESS_MANAGE", {
    entityType: "Pilot",
    entityId: pilotId,
    attemptedAction: enabled ? "grant ACARS Beta Access" : "revoke ACARS Beta Access",
  });
  const pilot = await prisma.pilot.findUnique({ where: { id: pilotId }, select: { id: true, displayName: true, acarsBetaAccess: true } });
  if (!pilot) redirect("/staff/acars-access?error=pilot_not_found");
  if (pilot.acarsBetaAccess !== enabled) {
    await prisma.$transaction([
      prisma.pilot.update({ where: { id: pilotId }, data: { acarsBetaAccess: enabled } }),
      prisma.aocAuditLog.create({ data: {
        staffUserId: staff.id,
        action: enabled ? "ACARS_BETA_ACCESS_GRANTED" : "ACARS_BETA_ACCESS_REVOKED",
        entityType: "Pilot",
        entityId: pilotId,
        message: `${enabled ? "Granted" : "Revoked"} ACARS Beta Access for ${pilot.displayName}.`,
        metadata: { pilotId, previousValue: pilot.acarsBetaAccess, newValue: enabled },
      } }),
    ]);
  }
  redirect(`/staff/acars-access?success=${enabled ? "access_granted" : "access_revoked"}`);
}
