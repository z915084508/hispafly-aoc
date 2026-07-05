import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentPilot } from "@/lib/pilot/session";
import { getCurrentStaff } from "@/lib/staff/currentStaff";
import { safeSimbriefPdfUrl } from "@/lib/simbrief/pdf";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ ofpBriefingId: string }> }) {
  const { ofpBriefingId } = await params;
  const ofp = await prisma.ofpBriefing.findUnique({
    where: { id: ofpBriefingId },
    select: { pdfUrl: true, flightDispatch: { select: { pilotId: true } } },
  });
  if (!ofp) return NextResponse.json({ error: "OFP not found" }, { status: 404 });

  const [pilot, staff] = await Promise.all([getCurrentPilot(), getCurrentStaff()]);
  const authorized = Boolean(staff?.active || (pilot && ofp.flightDispatch.pilotId === pilot.id));
  if (!authorized) return NextResponse.json({ error: "You do not have permission to view this OFP" }, { status: 403 });

  const pdfUrl = safeSimbriefPdfUrl(ofp.pdfUrl);
  if (!pdfUrl) return NextResponse.json({ error: "OFP PDF not available" }, { status: 404 });

  const response = NextResponse.redirect(pdfUrl, 302);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
