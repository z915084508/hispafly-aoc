import { NextRequest, NextResponse } from "next/server";
import { getCurrentPilot } from "@/lib/pilot/session";
import { prisma } from "@/lib/prisma";
import { normalizeFlightIdentity } from "@/lib/dispatch/flightIdentity";
import { buildVatsimPrefile } from "@/lib/vatsim/prefile";
import { writeAuditLogSafely } from "@/lib/audit/log";

export async function GET(request: NextRequest) {
  const pilot = await getCurrentPilot();
  if (!pilot) return NextResponse.redirect(new URL("/pilot", request.url));
  const ofpId = request.nextUrl.searchParams.get("ofpId")?.trim();
  if (!ofpId) return NextResponse.redirect(new URL("/pilot/ofp?error=Missing%20OFP", request.url));
  const ofp = await prisma.ofpBriefing.findFirst({
    where: { id: ofpId, status: "SIGNED", flightDispatch: { pilotId: pilot.id, status: "DISPATCHED" } },
    include: { flightDispatch: { include: { flightOffer: true } } },
  });
  if (!ofp) return NextResponse.redirect(new URL(`/pilot/ofp/${encodeURIComponent(ofpId)}?error=${encodeURIComponent("Final Dispatch must be completed before VATSIM prefiling.")}`, request.url));
  const dispatch = ofp.flightDispatch;
  const offer = dispatch.flightOffer;
  const identity = normalizeFlightIdentity({ flightNumber: offer.flightNumber, callsign: offer.callsign });
  const prefile = buildVatsimPrefile(ofp.ofpSnapshot, {
    callsign: identity.atcCallsign,
    aircraftType: offer.aircraftType,
    aircraftRegistration: offer.aircraftRegistration,
    departureIcao: offer.departureIcao,
    arrivalIcao: offer.arrivalIcao,
    route: offer.userRoute,
    altitude: offer.altitude,
    departureAt: dispatch.selectedDepartureAt,
  });
  if (!prefile.url) {
    return NextResponse.redirect(new URL(`/pilot/ofp/${ofp.id}?error=${encodeURIComponent(`VATSIM prefile is missing: ${prefile.missing.join(", ")}.`)}`, request.url));
  }
  await writeAuditLogSafely({
    action: "VATSIM_PREFILE_OPENED",
    entityType: "OfpBriefing",
    entityId: ofp.id,
    message: `${pilot.displayName} opened the VATSIM prefile form for ${identity.atcCallsign ?? offer.title}.`,
    metadata: { pilotId: pilot.id, dispatchId: dispatch.id, callsign: identity.atcCallsign, vamsysBookingId: dispatch.vamsysBookingId },
  });
  return NextResponse.redirect(prefile.url, 303);
}
