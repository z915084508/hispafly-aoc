import { Prisma, WalletTransactionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { distanceKm, jumpseatCostCents } from "./position-rules";
export { distanceKm, jumpseatCostCents } from "./position-rules";

export async function resolvePilotPosition(pilotId: string) {
  const pilot = await prisma.pilot.findUnique({ where: { id: pilotId }, include: { currentAirport: true } });
  if (!pilot) throw new Error("Pilot not found.");
  if (pilot.currentAirport) return { pilot, airport: pilot.currentAirport, inferred: false };
  const latest = await prisma.pirep.findFirst({ where: { pilotId, status: "accepted", arrival: { not: "" } }, orderBy: [{ acceptedAt: "desc" }, { flownAt: "desc" }, { createdAt: "desc" }], select: { arrival: true } });
  const icao = latest?.arrival || pilot.base;
  const airport = icao ? await prisma.airport.findUnique({ where: { icao: icao.toUpperCase() } }) : null;
  return { pilot, airport, inferred: Boolean(airport) };
}

export async function purchaseJumpseat(pilotId: string, arrivalAirportId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pilot-position:${pilotId}`}))`;
    const pilot = await tx.pilot.findUnique({ where: { id: pilotId }, include: { currentAirport: true } });
    if (!pilot) throw new Error("Pilot not found.");
    let departure = pilot.currentAirport;
    if (!departure) {
      const latest = await tx.pirep.findFirst({ where: { pilotId, status: "accepted", arrival: { not: "" } }, orderBy: [{ acceptedAt: "desc" }, { flownAt: "desc" }, { createdAt: "desc" }], select: { arrival: true } });
      const fallback = latest?.arrival || pilot.base;
      departure = fallback ? await tx.airport.findUnique({ where: { icao: fallback.toUpperCase() } }) : null;
    }
    if (!departure) throw new Error("Your current airport is unknown. Staff must set your position before Jumpseat can be used.");
    if (departure.id === arrivalAirportId) throw new Error("You are already at that airport.");
    const arrival = await tx.airport.findFirst({ where: { id: arrivalAirportId, status: "ACTIVE", archivedAt: null } });
    if (!arrival) throw new Error("The selected Jumpseat destination is unavailable.");
    const km = distanceKm(departure, arrival);
    if (km == null) throw new Error("Both airports need coordinates before Jumpseat can be priced.");
    const costCents = jumpseatCostCents(km);
    const charged = await tx.pilot.updateMany({ where: { id: pilotId, walletBalanceCents: { gte: costCents } }, data: { walletBalanceCents: { decrement: costCents }, currentAirportId: arrival.id, positionUpdatedAt: new Date(), positionSource: "JUMPSEAT" } });
    if (!charged.count) throw new Error(`Insufficient wallet balance. Jumpseat costs EUR ${(costCents / 100).toFixed(2)}.`);
    const wallet = await tx.walletTransaction.create({ data: { pilotId, type: WalletTransactionType.jumpseat, amountCents: -costCents, description: `Jumpseat ${departure.icao} to ${arrival.icao} (${km} km)`, reference: `JUMPSEAT:${departure.icao}:${arrival.icao}` } });
    const trip = await tx.pilotJumpseat.create({ data: { pilotId, departureAirportId: departure.id, arrivalAirportId: arrival.id, distanceKm: km, costCents, walletTransactionId: wallet.id } });
    await tx.aocAuditLog.create({ data: { action: "PILOT_JUMPSEAT_PURCHASED", entityType: "PilotJumpseat", entityId: trip.id, message: `Pilot moved by Jumpseat ${departure.icao}-${arrival.icao}; EUR ${(costCents / 100).toFixed(2)} deducted.`, metadata: { pilotId, departureAirportId: departure.id, arrivalAirportId: arrival.id, distanceKm: km, costCents, walletTransactionId: wallet.id } as Prisma.InputJsonValue } });
    return { trip, departure, arrival, costCents };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
