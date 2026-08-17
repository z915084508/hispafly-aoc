import { Prisma, WalletTransactionType } from "@prisma/client";
import { distanceKm } from "./position-rules";

export type CompanyRepositionReason = "AIRCRAFT_DELIVERY";

export async function companyRepositionPilot(
  tx: Prisma.TransactionClient,
  input: {
    pilotId: string;
    arrivalAirportId: string;
    reason: CompanyRepositionReason;
    referenceId: string;
  },
) {
  const pilot = await tx.pilot.findUnique({
    where: { id: input.pilotId },
    include: { currentAirport: true },
  });
  if (!pilot) throw new Error("Pilot not found.");

  const arrival = await tx.airport.findFirst({
    where: { id: input.arrivalAirportId, status: "ACTIVE", archivedAt: null },
  });
  if (!arrival) throw new Error("The company reposition destination is unavailable.");

  let departure = pilot.currentAirport;
  if (!departure) {
    const latest = await tx.pirep.findFirst({
      where: { pilotId: input.pilotId, status: "accepted", arrival: { not: "" } },
      orderBy: [{ acceptedAt: "desc" }, { flownAt: "desc" }, { createdAt: "desc" }],
      select: { arrival: true },
    });
    const fallback = latest?.arrival || pilot.base;
    departure = fallback
      ? await tx.airport.findUnique({ where: { icao: fallback.toUpperCase() } })
      : null;
  }

  if (!departure) {
    throw new Error("Your crew position is unknown. Set a valid crew position before accepting this delivery.");
  }

  if (departure.id === arrival.id) {
    await tx.pilot.update({
      where: { id: pilot.id },
      data: {
        currentAirportId: arrival.id,
        positionUpdatedAt: new Date(),
        positionSource: "AIRCRAFT_DELIVERY",
      },
    });
    return { repositioned: false as const, trip: null, departure, arrival, costCents: 0 };
  }

  // Company-sponsored operational reposition: preserve the normal Jumpseat audit
  // chain but never debit the pilot wallet. Distance is informational only, so a
  // missing coordinate pair must not turn a EUR 0 company reposition into a blocker.
  const km = distanceKm(departure, arrival) ?? 0;
  const wallet = await tx.walletTransaction.create({
    data: {
      pilotId: pilot.id,
      type: WalletTransactionType.jumpseat,
      amountCents: 0,
      description: `Company reposition ${departure.icao} to ${arrival.icao} for aircraft delivery`,
      reference: `COMPANY_REPOSITION:${input.reason}:${input.referenceId}`,
    },
  });
  const trip = await tx.pilotJumpseat.create({
    data: {
      pilotId: pilot.id,
      departureAirportId: departure.id,
      arrivalAirportId: arrival.id,
      distanceKm: km,
      costCents: 0,
      walletTransactionId: wallet.id,
    },
  });
  await tx.pilot.update({
    where: { id: pilot.id },
    data: {
      currentAirportId: arrival.id,
      positionUpdatedAt: new Date(),
      positionSource: "AIRCRAFT_DELIVERY",
    },
  });
  await tx.aocAuditLog.create({
    data: {
      action: "DELIVERY_CREW_REPOSITIONED",
      entityType: "PilotJumpseat",
      entityId: trip.id,
      message: `Pilot repositioned ${departure.icao}-${arrival.icao} for aircraft delivery; company-sponsored Jumpseat EUR 0.00.`,
      metadata: {
        pilotId: pilot.id,
        reason: input.reason,
        referenceId: input.referenceId,
        departureAirportId: departure.id,
        arrivalAirportId: arrival.id,
        distanceKm: km,
        costCents: 0,
        walletTransactionId: wallet.id,
        pilotWalletDebited: false,
      } as Prisma.InputJsonValue,
    },
  });
  return { repositioned: true as const, trip, departure, arrival, costCents: 0 };
}
