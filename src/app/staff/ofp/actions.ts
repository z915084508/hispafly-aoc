"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminStaff } from "@/lib/staff/requireAdmin";
import { generateDispatchSimBriefOfp } from "@/lib/simbrief/ofp";

export async function staffGenerateSimbriefOFPAction(formData: FormData) {
  const staff = await requireAdminStaff();
  const ofpId = String(formData.get("ofpId") ?? "");
  let error: string | null = null;
  try {
    const record = await prisma.ofpBriefing.findUnique({ where: { id: ofpId }, select: { flightDispatch: { select: { pilotId: true } } } });
    if (!record) throw new Error("OFP not found.");
    await generateDispatchSimBriefOfp({ ofpId, pilotId: record.flightDispatch.pilotId, staffUserId: staff.id === "development-staff" ? null : staff.id });
    revalidatePath("/staff/ofp"); revalidatePath(`/pilot/ofp/${ofpId}`); revalidatePath("/pilot/ofp");
  } catch (caught) { error = caught instanceof Error ? caught.message : "OFP generation failed."; }
  redirect(`/staff/ofp?${error ? `error=${encodeURIComponent(error)}` : `success=${encodeURIComponent("OFP generated.")}`}`);
}

