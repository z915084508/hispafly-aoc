import { currentAuthUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { efbErrorResponse, efbJson, efbOptions } from "@/lib/efb-performance/http";

export const dynamic = "force-dynamic";
export function OPTIONS(request: Request) { return efbOptions(request); }
const hasEfbReadAccess = (user: Awaited<ReturnType<typeof currentAuthUser>>) => Boolean(user?.pilot && user.pilot.status === "active" && user.roles.some(({ role }) => role.code === "PILOT" || role.code === "ADMIN"));

const activeBookingStatuses = ["PENDING", "CONFIRMED", "DISPATCH_PENDING", "DISPATCHED", "IN_PROGRESS", "BOOKED"] as const;

export async function GET(request: Request, context: { params: Promise<{ segments: string[] }> }) {
  try {
    const user = await currentAuthUser();
    if (!user) return efbJson(request, { error: "unauthorized", message: "Log in with your HISPAFLY AOC account." }, 401);
    if (!hasEfbReadAccess(user) || !user.pilot) return efbJson(request, { error: "efb_read_forbidden", message: "An active HISPAFLY pilot role is required." }, 403);
    const pilot = user.pilot;
    const { segments } = await context.params;
    const resource = segments.join("/");
    if (resource === "user") return efbJson(request, { data: { id: user.id, email: user.email, display_name: user.displayName, first_name: pilot.firstName, last_name: pilot.lastName, pilot: { id: pilot.id, callsign: pilot.callsign }, networks: { vatsim_id: pilot.vatsimId, ivao_id: pilot.ivaoId } } });
    if (resource === "profile") {
      const profile = await prisma.pilot.findUnique({ where: { id: pilot.id }, include: { currentAirport: true } });
      if (!profile) return efbJson(request, { error: "pilot_not_found", message: "Pilot profile not found." }, 404);
      return efbJson(request, { data: { id: profile.id, callsign: profile.callsign, base: profile.base, hub: profile.hubId || profile.base, hub_id: profile.hubId, status: profile.status, current_airport: profile.currentAirport?.icao || null, current_airport_name: profile.currentAirport?.name || null, location: profile.currentAirport?.icao || null, position_updated_at: profile.positionUpdatedAt, position_source: profile.positionSource, wallet_balance_cents: profile.walletBalanceCents, wallet_currency: "EUR" } });
    }
    if (resource === "rank") return efbJson(request, { data: { name: pilot.rankName || pilot.rank, abbreviation: pilot.rankAbbreviation } });
    if (resource === "statistics") {
      const result = await prisma.pirep.aggregate({ where: { pilotId: pilot.id, status: "accepted" }, _count: { id: true }, _sum: { flightTimeMinutes: true, blockTimeMinutes: true, flightDistanceNm: true } });
      return efbJson(request, { data: { flights: result._count.id, flight_time_minutes: result._sum.flightTimeMinutes || 0, block_time_minutes: result._sum.blockTimeMinutes || 0, distance_nm: result._sum.flightDistanceNm || 0 } });
    }
    if (resource === "bookings") {
      const rows = await prisma.pilotBooking.findMany({ where: { pilotId: pilot.id, dataOrigin: "HISPAFLY_NATIVE", status: { in: [...activeBookingStatuses] } }, include: { aircraft: true, dispatch: { include: { ofpBriefing: true } } }, orderBy: { selectedDepartureAt: "desc" }, take: 50 });
      return efbJson(request, { data: rows.map((row) => ({ id: row.id, status: row.status, flight_number: row.flightNumber, callsign: row.callsign, departure: row.departureIcao, arrival: row.arrivalIcao, departure_time: row.selectedDepartureAt, arrival_time: row.estimatedArrivalAt, aircraft_type: row.aircraftType, aircraft_registration: row.aircraftRegistration, passengers: row.passengers, cargo_kg: row.cargoKg, dispatch_id: row.dispatch?.id, ofp_id: row.dispatch?.ofpBriefing?.id, pdf_url: row.dispatch?.ofpBriefing ? `/api/ofp/${row.dispatch.ofpBriefing.id}/pdf` : null })), meta: { source: "HISPAFLY_AOC" } });
    }
    const bookingMatch = resource.match(/^bookings\/([^/]+)(?:\/(simbrief))?$/);
    if (bookingMatch) {
      const row = await prisma.pilotBooking.findFirst({ where: { id: bookingMatch[1], pilotId: pilot.id, dataOrigin: "HISPAFLY_NATIVE" }, include: { aircraft: true, flight: true, dispatch: { include: { ofpBriefing: true } } } });
      if (!row) return efbJson(request, { error: "booking_not_found", message: "Booking not found." }, 404);
      if (bookingMatch[2] === "simbrief") {
        if (!row.dispatch?.ofpBriefing) return efbJson(request, { error: "ofp_not_available", message: "The native OFP is not available." }, 404);
        const snapshot = row.dispatch.ofpBriefing.ofpSnapshot;
        const pdfUrl = row.dispatch.ofpBriefing.pdfUrl ? `/api/aoc-proxy?path=${encodeURIComponent(`/api/ofp/${row.dispatch.ofpBriefing.id}/pdf`)}` : null;
        const data = snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) ? { ...snapshot, ...(pdfUrl ? { pdf_url: pdfUrl } : {}) } : { snapshot, pdf_url: pdfUrl };
        return efbJson(request, { data, meta: { ofpBriefingId: row.dispatch.ofpBriefing.id, contentHash: row.dispatch.ofpBriefing.contentHash } });
      }
      return efbJson(request, { data: { id: row.id, status: row.status, flight_number: row.flightNumber, callsign: row.callsign, departure: row.departureIcao, arrival: row.arrivalIcao, departure_time: row.selectedDepartureAt, arrival_time: row.estimatedArrivalAt, aircraft_type: row.aircraftType, aircraft_registration: row.aircraftRegistration, passengers: row.passengers, cargo_kg: row.cargoKg, dispatch_id: row.dispatch?.id, ofp_id: row.dispatch?.ofpBriefing?.id, pdf_url: row.dispatch?.ofpBriefing ? `/api/ofp/${row.dispatch.ofpBriefing.id}/pdf` : null } });
    }
    if (resource === "pireps") {
      const rows = await prisma.pirep.findMany({ where: { pilotId: pilot.id }, orderBy: [{ flownAt: "desc" }, { createdAt: "desc" }], take: 100 });
      return efbJson(request, { data: rows.map((row) => ({ id: row.id, pirep_id: row.id, status: row.status, flight_number: row.flightNumber, callsign: row.callsign, departure: row.departure, departure_icao: row.departure, arrival: row.arrival, arrival_icao: row.arrival, aircraft_type: row.aircraftType, aircraft_registration: row.aircraftRegistration, network: row.network, flight_time: row.flightTimeMinutes, flight_time_minutes: row.flightTimeMinutes, block_time_minutes: row.blockTimeMinutes, distance: row.flightDistanceNm, distance_nm: row.flightDistanceNm, landing_rate: row.landingRate, score: row.score, fuel_used: row.fuelUsed, passengers: row.passengers, cargo_kg: row.cargoKg, flown_at: row.flownAt, accepted_at: row.acceptedAt, created_at: row.createdAt, source: row.source })) });
    }
    const pirepMatch = resource.match(/^pireps\/([^/]+)\/(positions|profile)$/);
    if (pirepMatch) {
      const row = await prisma.pirep.findFirst({ where: { id: pirepMatch[1], pilotId: pilot.id }, include: { acarsSession: { include: { positions: { orderBy: { sequenceNumber: "asc" }, take: 2000 } } } } });
      if (!row) return efbJson(request, { error: "pirep_not_found", message: "PIREP not found." }, 404);
      if (pirepMatch[2] === "positions") return efbJson(request, { data: (row.acarsSession?.positions || []).map((point) => ({ latitude: point.latitude, longitude: point.longitude, altitude: point.altitudeFeet, ground_speed: point.groundSpeedKnots, heading: point.headingDegrees, fuel: point.fuelKg, phase: point.phase, created_at: point.recordedAt })) });
      return efbJson(request, { data: { id: row.id, pirep_id: row.id, status: row.status, flight_number: row.flightNumber, callsign: row.callsign, departure: row.departure, departure_icao: row.departure, arrival: row.arrival, arrival_icao: row.arrival, aircraft_type: row.aircraftType, aircraft_registration: row.aircraftRegistration, network: row.network, flight_time: row.flightTimeMinutes, flight_time_minutes: row.flightTimeMinutes, block_time_minutes: row.blockTimeMinutes, distance: row.flightDistanceNm, distance_nm: row.flightDistanceNm, landing_rate: row.landingRate, score: row.score, fuel_used: row.fuelUsed, passengers: row.passengers, cargo_kg: row.cargoKg, flown_at: row.flownAt, accepted_at: row.acceptedAt, source: row.source } });
    }
    if (resource === "claims" || resource === "notams") return efbJson(request, { data: [], meta: { source: "HISPAFLY_AOC", supported: false } });
    return efbJson(request, { error: "not_found", message: "EFB resource not found." }, 404);
  } catch (error) { return efbErrorResponse(request, error); }
}
