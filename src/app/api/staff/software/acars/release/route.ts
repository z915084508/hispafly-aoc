import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaff } from "@/lib/staff/currentStaff";

export const runtime = "nodejs";

const VERSION_RE = /^\d+\.\d+\.\d+(?:[-.][0-9A-Za-z.-]+)?$/;
const PRODUCT = "HISPAFLY_ACARS";

type PublishBody = {
  version?: string;
  downloadUrl?: string;
  notes?: string;
  mandatory?: boolean;
};

function validateBlobUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error("The download URL must use HTTPS.");
  if (!url.hostname.endsWith(".public.blob.vercel-storage.com")) {
    throw new Error("Use a public Vercel Blob download URL.");
  }
  if (!url.pathname.toLowerCase().endsWith(".exe")) throw new Error("The URL must point to a Windows .exe installer.");
  return url;
}

export async function POST(request: Request) {
  try {
    const staff = await getCurrentStaff();
    if (!staff) return NextResponse.json({ error: "Staff authentication required." }, { status: 401 });

    const body = await request.json() as PublishBody;
    const version = String(body.version ?? "").trim();
    const notes = String(body.notes ?? "").trim();
    const mandatory = Boolean(body.mandatory);
    const url = validateBlobUrl(String(body.downloadUrl ?? "").trim());

    if (!VERSION_RE.test(version)) throw new Error("Use a version such as 1.0.0.");

    let fileSize = 0;
    try {
      const head = await fetch(url, { method: "HEAD", cache: "no-store" });
      fileSize = Number(head.headers.get("content-length") ?? 0) || 0;
    } catch {
      fileSize = 0;
    }

    const fileName = decodeURIComponent(url.pathname.split("/").pop() || `HispaFly-ACARS-${version}.exe`);
    const id = crypto.randomUUID();

    await prisma.$executeRaw`
      INSERT INTO "SoftwareRelease" (
        "id", "product", "version", "downloadUrl", "fileName", "fileSize", "notes", "mandatory", "publishedAt", "publishedByStaffId"
      ) VALUES (
        ${id}, ${PRODUCT}, ${version}, ${url.toString()}, ${fileName}, ${BigInt(fileSize)}, ${notes}, ${mandatory}, NOW(), ${staff.id}
      )
      ON CONFLICT ("product", "version") DO UPDATE SET
        "downloadUrl" = EXCLUDED."downloadUrl",
        "fileName" = EXCLUDED."fileName",
        "fileSize" = EXCLUDED."fileSize",
        "notes" = EXCLUDED."notes",
        "mandatory" = EXCLUDED."mandatory",
        "publishedAt" = NOW(),
        "publishedByStaffId" = EXCLUDED."publishedByStaffId"
    `;

    return NextResponse.json({ ok: true, version, fileName, fileSize });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Release publication failed." }, { status: 400 });
  }
}
