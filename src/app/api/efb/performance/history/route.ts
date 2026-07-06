import { authenticateEfbPilot, efbErrorResponse, efbJson, efbOptions } from "@/lib/efb-performance/http";
import { getPerformanceHistory } from "@/lib/efb-performance/service";
export const dynamic = "force-dynamic";
export function OPTIONS(request: Request) { return efbOptions(request); }
export async function GET(request: Request) { try { const pilot = await authenticateEfbPilot(request); return efbJson(request, { history: await getPerformanceHistory(pilot.id) }); } catch (error) { return efbErrorResponse(request, error); } }
