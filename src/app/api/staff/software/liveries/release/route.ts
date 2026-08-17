import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentStaff } from "@/lib/staff/currentStaff";
import { buildLiveryProduct, type LiverySimulator } from "@/lib/software/livery-release";

export const runtime = "nodejs";

const VERSION_RE = /^\d+\.\d+\.\d+(?:[-.][0-9A-Za-z.-]+)?$/;
const ALLOWED_EXTENSIONS = [".zip", ".7z", ".rar"];

type PublishBody = {
  aircraftType?: string;
  addon?: string;
  simulator?: LiverySimulator;
  registration?: string;
  version?: string;
  downloadUrl?: string;
  notes?: string;
};

function validateBlobUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error("The download URL must use HTTPS.");
  if (!url.hostname.endsWith(".public.blob.vercel-storage.com")) {
    throw new Error("Use a public Vercel Blob download URL.");
  }
  const path = url.pathname.toLowerCase();
  if (!ALLOWED_EXTENSIONS.some((extension) => path.endsWith(extension))) {
    throw new Error("The URL must point to a .zip, .7z or .rar livery package.");
  }
  return url;
}

export async function POST(request: Request) {
  try {
    const staff = await getCurrentStaff();
    if (!staff) return NextResponse.json({ error: "Staff authentication required." }, { status: 401 });

    const body = await request.json() as PublishBody;
    const aircraftType = String(body.aircraftType ?? "").trim();
    const addon = String(body.addon ?? "").trim();
    const registration = String(body.registration ?? "").trim();
    const version = String(body.version ?? "").trim();
    const notes = String(body.notes ?? "").trim();
    const simulator: LiverySimulator = body.simulator === "MSFS2020" ? "MSFS2020" : "MSFS2024";
    const url = validateBlobUrl(String(body.downloadUrl ?? "").trim());

    if (!aircraftType) throw new Error("Aircraft type is required.");
    if (!addon) throw new Error("Aircraft add-on is required.");
    if (!VERSION_RE.test(version)) throw new Error("Use a version such as 1.0.0.");

    let fileSize = 0;
    try {
      const head = await fetch(url, { method: "HEAD", cache: "no-store" });
      fileSize = Number(head.headers.get("content-length") ?? 0) || 0;
    } catch {
      fileSize = 0;
    }

    const product = buildLiveryProduct({ aircraftType, addon, simulator, registration });
    const fileName = decodeURIComponent(url.pathname.split("/").pop() || `HISPAFLY-${aircraftType}-${version}.zip`);
    const id = crypto.randomUUID();

    await prisma.$executeRaw`
      INSERT INTO "SoftwareRelease" (
        "id", "product", "version", "downloadUrl", "fileName", "fileSize", "notes", "mandatory", "channel", "publishedAt", "publishedByStaffId"
      ) VALUES (
        ${id}, ${product}, ${version}, ${url.toString()}, ${fileName}, ${BigInt(fileSize)}, ${notes}, ${false}, ${"STABLE"}, NOW(), ${staff.id}
      )
      ON CONFLICT ("product", "version") DO UPDATE SET
        "downloadUrl" = EXCLUDED."downloadUrl",
        "fileName" = EXCLUDED."fileName",
        "fileSize" = EXCLUDED."fileSize",
        "notes" = EXCLUDED."notes",
        "publishedAt" = NOW(),
        "publishedByStaffId" = EXCLUDED."publishedByStaffId"
    `;

    return NextResponse.json({ ok: true, product, version, fileName, fileSize });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Livery publication failed." }, { status: 400 });
  }
}
