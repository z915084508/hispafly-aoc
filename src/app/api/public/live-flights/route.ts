import { getLiveFlights } from "@/lib/acars/live-tracking";

export const dynamic = "force-dynamic";

const headers = { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, s-maxage=10, stale-while-revalidate=20" };

export async function GET() {
  const flights = (await getLiveFlights()).map((row) => {
    const { id, pilot, fuelKg, ...flight } = row;
    void id; void pilot; void fuelKg;
    return flight;
  });
  return Response.json({ updatedAt: new Date().toISOString(), flights }, { headers });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: { ...headers, "Access-Control-Allow-Methods": "GET, OPTIONS" } });
}
