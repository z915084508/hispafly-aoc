import { getLiveFlights } from "@/lib/acars/live-tracking";

export const dynamic = "force-dynamic";

const headers = { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, s-maxage=10, stale-while-revalidate=20" };

export async function GET() {
  const flights = (await getLiveFlights()).map(({ id: _id, pilot: _pilot, fuelKg: _fuelKg, ...flight }) => flight);
  return Response.json({ updatedAt: new Date().toISOString(), flights }, { headers });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: { ...headers, "Access-Control-Allow-Methods": "GET, OPTIONS" } });
}
