import { PageHeading } from "@/components/page-heading";
import { PilotPortalShell } from "@/components/pilot-portal-shell";
import { RouteNetworkExplorer } from "@/components/route-network/route-network-explorer";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function PilotRouteMapPage({ searchParams }: { searchParams: Promise<{ airport?: string }> }) {
  const query = await searchParams;
  const routes = await prisma.route.findMany({
    where: { active: true, operationalStatus: "ACTIVE", archivedAt: null, departureAirport: { latitude: { not: null }, longitude: { not: null } }, arrivalAirport: { latitude: { not: null }, longitude: { not: null } } },
    select: { id: true, departure: true, arrival: true, flightNumber: true, routeCode: true, scheduledDurationMinutes: true, departureAirport: { select: { id: true, icao: true, name: true, latitude: true, longitude: true } }, arrivalAirport: { select: { id: true, icao: true, name: true, latitude: true, longitude: true } } },
    orderBy: [{ departure: "asc" }, { arrival: "asc" }],
  });
  const counts = new Map<string, number>();
  for (const route of routes) counts.set(route.departure, (counts.get(route.departure) ?? 0) + 1);
  const airports = new Map<string, { id: string; icao: string; name: string | null; latitude: number; longitude: number; outboundCount: number }>();
  for (const route of routes) for (const airport of [route.departureAirport, route.arrivalAirport]) if (airport?.latitude != null && airport.longitude != null) airports.set(airport.icao, { id: airport.id, icao: airport.icao, name: airport.name, latitude: airport.latitude, longitude: airport.longitude, outboundCount: counts.get(airport.icao) ?? 0 });
  return <PilotPortalShell><PageHeading eyebrow="HISPAFLY NETWORK" title="Route map" copy="Explore every active HISPAFLY route. Select an airport to see all available departures from that station."/><RouteNetworkExplorer airports={[...airports.values()]} routes={routes.map((route) => ({ id: route.id, departure: route.departure, arrival: route.arrival, flightNumber: route.flightNumber, routeCode: route.routeCode, duration: route.scheduledDurationMinutes }))} initialAirport={query.airport?.toUpperCase()}/></PilotPortalShell>;
}
