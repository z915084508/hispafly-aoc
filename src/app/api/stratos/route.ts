/** Stratos Core API handshake (OpenAPI 0.3.0).
 * This endpoint is intentionally public and has no database side effects.
 * Mount the airline's Stratos base URL at /api/stratos.
 */
export async function GET() {
  return Response.json(
    { api_version: "0.3.0", handler: "Stratos" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
