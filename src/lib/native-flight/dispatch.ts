import { prisma } from "@/lib/prisma";
import type { NativeOrigin } from "./airport";

export const findDispatchById = (id: string) => prisma.flightDispatch.findUnique({
  where: { id }, include: { booking: true, flight: true, route: true, aircraft: true, ofpBriefing: true },
});

export async function createNativeDispatch(input: {
  bookingId: string;
  flightOfferId: string;
  dataOrigin?: NativeOrigin;
}) {
  const [booking, offer] = await Promise.all([
    prisma.pilotBooking.findUnique({ where: { id: input.bookingId } }),
    prisma.flightOffer.findUnique({ where: { id: input.flightOfferId }, select: { id: true } }),
  ]);
  if (!booking?.flightId || !booking.routeId) throw new Error("Booking does not have complete native flight identity.");
  if (!offer) throw new Error("Flight offer does not exist.");
  return prisma.flightDispatch.create({ data: {
    flightOfferId: offer.id, bookingId: booking.id, pilotId: booking.pilotId,
    flightId: booking.flightId, routeId: booking.routeId, aircraftId: booking.aircraftId,
    selectedDepartureAt: booking.selectedDepartureAt, estimatedArrivalAt: booking.estimatedArrivalAt,
    status: "DISPATCHING", dataOrigin: input.dataOrigin ?? "HISPAFLY_NATIVE",
  } });
}

export async function attachNativeIdentityToDispatch(input: {
  dispatchId: string; bookingId: string; dataOrigin?: NativeOrigin;
}) {
  const booking = await prisma.pilotBooking.findUnique({ where: { id: input.bookingId } });
  if (!booking?.flightId || !booking.routeId) throw new Error("Booking does not have complete native flight identity.");
  return prisma.flightDispatch.update({ where: { id: input.dispatchId }, data: {
    bookingId: booking.id, flightId: booking.flightId, routeId: booking.routeId,
    aircraftId: booking.aircraftId, dataOrigin: input.dataOrigin ?? "HISPAFLY_NATIVE",
  } });
}
