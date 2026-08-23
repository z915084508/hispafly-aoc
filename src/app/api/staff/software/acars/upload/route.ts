import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { getCurrentStaff } from "@/lib/staff/currentStaff";

export const runtime = "nodejs";

type UploadMetadata = {
  version: string;
  notes: string;
  mandatory: boolean;
  fileSize: number;
  originalName: string;
  channel?: "STABLE" | "BETA";
};

const VERSION_RE = /^\d+\.\d+\.\d+(?:[-.][0-9A-Za-z.-]+)?$/;

export async function GET() {
  return NextResponse.json({ configured: Boolean(process.env.BLOB_READ_WRITE_TOKEN) });
}

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const staff = await getCurrentStaff();
        if (!staff) throw new Error("Staff authentication required.");
        if (!pathname.toLowerCase().endsWith(".exe")) throw new Error("Only Windows .exe installers are allowed.");

        const metadata = JSON.parse(clientPayload ?? "{}") as Partial<UploadMetadata>;
        if (!metadata.version || !VERSION_RE.test(metadata.version)) throw new Error("Invalid semantic version.");
        if (!metadata.originalName?.toLowerCase().endsWith(".exe")) throw new Error("Invalid installer filename.");
        if (!Number.isFinite(metadata.fileSize) || Number(metadata.fileSize) <= 0) throw new Error("Invalid file size.");

        return {
          allowedContentTypes: ["application/x-msdownload", "application/vnd.microsoft.portable-executable", "application/octet-stream"],
          maximumSizeInBytes: 250 * 1024 * 1024,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ ...metadata, staffId: staff.id }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        if (!tokenPayload) throw new Error("Upload metadata was not returned by Vercel Blob.");
        const metadata = JSON.parse(tokenPayload) as UploadMetadata & { staffId: string };
        const release = {
          product: "HispaFly ACARS",
          version: metadata.version,
          notes: metadata.notes,
          mandatory: Boolean(metadata.mandatory),
          fileName: metadata.originalName,
          fileSize: metadata.fileSize,
          downloadUrl: blob.downloadUrl ?? blob.url,
          blobUrl: blob.url,
          pathname: blob.pathname,
          publishedAt: new Date().toISOString(),
          publishedByStaffId: metadata.staffId,
          channel: metadata.channel === "BETA" ? "BETA" : "STABLE",
        };
        const json = JSON.stringify(release, null, 2);
        await Promise.all([
          put(`software/acars/releases/${metadata.version}.json`, json, { access: "public", allowOverwrite: true, contentType: "application/json", cacheControlMaxAge: 60 }),
          put(`software/acars/${release.channel.toLowerCase()}/latest.json`, json, { access: "public", allowOverwrite: true, contentType: "application/json", cacheControlMaxAge: 60 }),
        ]);
      },
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Upload failed." }, { status: 400 });
  }
}
