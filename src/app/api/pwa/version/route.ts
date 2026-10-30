// This endpoint exposes only a generated public build marker, never server settings.
// Dynamic rendering prevents an upstream cache from hiding a newly deployed build.
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    { buildId: process.env.NEXT_PUBLIC_AOC_BUILD_ID ?? "development" },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
