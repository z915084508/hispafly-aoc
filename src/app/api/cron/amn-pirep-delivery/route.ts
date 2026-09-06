import type { NextRequest } from "next/server";
import { isCronAuthorized, cronUnauthorizedResponse } from "@/lib/cron/auth";
import { previewAmnPirepBackfill, retryAmnPireps } from "@/lib/amn/pirep-delivery";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) return cronUnauthorizedResponse();
  if (request.nextUrl.searchParams.get("mode") === "preview") {
    const results = await previewAmnPirepBackfill();
    return Response.json({ summary: { ready: results.filter(result => result.status === "READY").length, blocked: results.filter(result => result.status === "BLOCKED").length }, results }, { headers: { "Cache-Control": "no-store" } });
  }
  return Response.json({ results: await retryAmnPireps() }, { headers: { "Cache-Control": "no-store" } });
}
