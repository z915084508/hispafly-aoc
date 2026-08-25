"use server";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePilotSession } from "@/lib/pilot/session";
import { createNativeSelfDispatch } from "@/lib/native-flight/self-dispatch";
import { createNativeDispatch } from "@/lib/native-flight/dispatch";
import { createDispatchOfpBriefing } from "@/lib/simbrief/ofp";
import { assertNavigraphConnected } from "@/lib/navigraph/token";
import { purchaseJumpseat } from "@/lib/pilot/position";
import { prisma } from "@/lib/prisma";
import { verifyAmnPayloadAllocation } from "@/lib/amn/payload";

export async function setInitialCrewPositionAction(formData: FormData) {
  const pilotSession = await requirePilotSession();
  const airportId = String(formData.get("airportId") ?? "").trim();
  if (!airportId) redirect("/pilot/flight-offers/self-dispatch?error=Select an airport to continue.");

  const [pilot, airport] = await Promise.all([
    prisma.pilot.findUnique({ where: { id: pilotSession.id }, select: { id: true, currentAirportId: true } }),
    prisma.airport.findFirst({ where: { id: airportId, status: "ACTIVE", archivedAt: null }, select: { id: true, icao: true } }),
  ]);
  if (!pilot) redirect("/pilot/flight-offers/self-dispatch?error=Pilot account not found.");
  if (pilot.currentAirportId) redirect("/pilot/flight-offers/self-dispatch?error=Your crew position is already set. Use Jumpseat to move.");
  if (!airport) redirect("/pilot/flight-offers/self-dispatch?error=The selected airport is unavailable.");

  await prisma.$transaction([
    prisma.pilot.update({ where: { id: pilot.id }, data: { currentAirportId: airport.id, positionUpdatedAt: new Date(), positionSource: "INITIAL_SELECTION" } }),
    prisma.aocAuditLog.create({ data: { action: "PILOT_INITIAL_POSITION_SET", entityType: "Pilot", entityId: pilot.id, message: `Pilot selected ${airport.icao} as the initial crew position.`, metadata: { pilotId: pilot.id, airportId: airport.id, airportIcao: airport.icao } as Prisma.InputJsonValue } }),
  ]);
  revalidatePath("/pilot/flight-offers/self-dispatch"); revalidatePath("/pilot/dashboard");
  redirect(`/pilot/flight-offers/self-dispatch?success=${encodeURIComponent(`Crew position set to ${airport.icao}.`)}`);
}

export async function purchaseJumpseatAction(formData: FormData) {
  const pilot = await requirePilotSession();
  try {
    const result = await purchaseJumpseat(pilot.id, String(formData.get("arrivalAirportId") ?? ""));
    revalidatePath("/pilot/flight-offers/self-dispatch"); revalidatePath("/pilot/dashboard"); revalidatePath("/pilot/wallet");
    redirect(`/pilot/flight-offers/self-dispatch?success=${encodeURIComponent(`Jumpseat complete. Crew position is now ${result.arrival.icao}.`)}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect(`/pilot/flight-offers/self-dispatch?error=${encodeURIComponent(error instanceof Error ? error.message : "Jumpseat failed")}`);
  }
}

export async function createNativeSelfDispatchAction(formData: FormData) {
  const pilot = await requirePilotSession();
  const rawDeparture = String(formData.get("departureAt") ?? "");
  let bookingId: string | null = null;
  try {
    await assertNavigraphConnected(pilot.id);
    const allocation = verifyAmnPayloadAllocation(String(formData.get("amnPayloadToken") ?? ""));
    const departureAt = new Date(`${rawDeparture}:00Z`);
    if (allocation.routeId !== String(formData.get("routeId") ?? "") || allocation.aircraftId !== String(formData.get("aircraftId") ?? "") || allocation.operatingDate !== departureAt.toISOString().slice(0, 10)) throw new Error("Route, aircraft or date changed after AMN allocated Payload. Generate it again.");
    const booking = await createNativeSelfDispatch({
      pilotId: pilot.id, routeId: String(formData.get("routeId") ?? ""), aircraftId: String(formData.get("aircraftId") ?? ""),
      departureAt, idempotencyKey: String(formData.get("idempotencyKey") ?? ""),
      network: String(formData.get("network") ?? "vatsim"), altitude: Number(formData.get("altitude")) || null,
      amnAllocation: allocation, userRoute: String(formData.get("userRoute") ?? "").trim() || null,
      acknowledgeLocationWarning: formData.get("acknowledgeLocationWarning") === "yes",
    });
    bookingId = booking.id;
    const dispatch = await createNativeDispatch({ bookingId: booking.id, aircraftId: booking.aircraftId, actorPilotId: pilot.id, idempotencyKey: `self-dispatch:${booking.id}` });
    const ofp = await createDispatchOfpBriefing(dispatch.id);
    revalidatePath("/pilot/flight-offers"); revalidatePath("/pilot/bookings");
    redirect(`/pilot/ofp/${ofp.id}?success=Operation+created.+Generate+the+SimBrief+OFP+when+ready`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    if (bookingId) redirect(`/pilot/bookings/${bookingId}?error=${encodeURIComponent(error instanceof Error ? error.message : "OFP preparation failed")}`);
    redirect(`/pilot/flight-offers/self-dispatch?error=${encodeURIComponent(error instanceof Error ? error.message : "Self-dispatch failed")}`);
  }
}
