export type RouteMapAirport = { id: string; icao: string; name: string | null; latitude: number; longitude: number; outboundCount: number };
export type RouteMapRoute = { id: string; departure: string; arrival: string; flightNumber: string | null; routeCode: string | null; duration: number | null };
