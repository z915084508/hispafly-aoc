import { handleUploadPresigned, type HandleUploadPresignedBody } from "@vercel/blob/client";
import { issueSignedToken } from "@vercel/blob";
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
  return NextResponse.json({
    configured: Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID),
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadPresignedBody;

  try {
    const response = await handleUploadPresigned({
      body,
      request,
      getSignedToken: async (pathname, clientPayload) => {
        const staff = await getCurrentStaff();
        if (!staff) throw new Error("Staff authentication required.");
        if (!pathname.toLowerCase().endsWith(".exe")) throw new Error("Only Windows .exe installers are allowed.");

        const metadata = JSON.parse(clientPayload ?? "{}") as Partial<UploadMetadata>;
        if (!metadata.version || !VERSION_RE.test(metadata.version)) throw new Error("Invalid semantic version.");
        if (!metadata.originalName?.toLowerCase().endsWith(".exe")) throw new Error("Invalid installer filename.");
        if (!Number.isFinite(metadata.fileSize) || Number(metadata.fileSize) <= 0) throw new Error("Invalid file size.");

        const token = await issueSignedToken({
          pathname,
          operations: ["put"],
          allowedContentTypes: ["application/x-msdownload", "application/vnd.microsoft.portable-executable", "application/octet-stream"],
          maximumSizeInBytes: 250 * 1024 * 1024,
          validUntil: Date.now() + 60 * 60 * 1000,
        });

        return {
          token,
          urlOptions: {
            addRandomSuffix: true,
            contentType: "application/octet-stream",
          },
        };
      },
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Upload failed." }, { status: 400 });
  }
}
