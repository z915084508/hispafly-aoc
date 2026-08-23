import { NextResponse } from "next/server";
import { getLatestAcarsRelease } from "@/lib/software/acars-release";

export const dynamic = "force-dynamic";

export async function GET() {
  const release = await getLatestAcarsRelease("STABLE");
  if (!release) return NextResponse.json({ error: "No stable ACARS release is available." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({
    version: release.version,
    notes: release.notes,
    mandatory: release.mandatory,
    fileName: release.fileName,
    fileSize: release.fileSize,
    downloadUrl: release.downloadUrl,
    publishedAt: release.publishedAt,
    channel: release.channel,
  }, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } });
}
