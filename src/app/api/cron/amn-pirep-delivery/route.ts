import type { NextRequest } from "next/server";
import { isCronAuthorized, cronUnauthorizedResponse } from "@/lib/cron/auth";
import { retryAmnPireps } from "@/lib/amn/pirep-delivery";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) return cronUnauthorizedResponse();
  return Response.json({ results: await retryAmnPireps() }, { headers: { "Cache-Control": "no-store" } });
}
