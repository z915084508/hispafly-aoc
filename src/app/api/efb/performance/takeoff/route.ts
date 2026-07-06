import { authenticateEfbPilot, efbErrorResponse, efbJson, efbOptions, EfbApiError } from "@/lib/efb-performance/http";
import { runPerformanceCalculation } from "@/lib/efb-performance/service";
export const dynamic = "force-dynamic";
export function OPTIONS(request: Request) { return efbOptions(request); }
export async function POST(request: Request) { try { const pilot = await authenticateEfbPilot(request); const body = await request.json().catch(() => null); if (!body || typeof body !== "object" || Array.isArray(body)) throw new EfbApiError(400, "INVALID_JSON", "A JSON request body is required."); return efbJson(request, await runPerformanceCalculation(pilot.id, "TAKEOFF", body)); } catch (error) { return efbErrorResponse(request, error); } }
