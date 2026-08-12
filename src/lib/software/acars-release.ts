import { prisma } from "@/lib/prisma";
import type { AcarsReleaseChannel } from "@/lib/acars/release-channel";
export type { AcarsReleaseChannel } from "@/lib/acars/release-channel";

export type AcarsRelease = {
  product: string;
  version: string;
  notes: string;
  mandatory: boolean;
  fileName: string;
  fileSize: number;
  downloadUrl: string;
  publishedAt: string;
  publishedByStaffId?: string;
  channel: AcarsReleaseChannel;
};

type ReleaseRow = {
  product: string;
  version: string;
  notes: string;
  mandatory: boolean;
  fileName: string;
  fileSize: bigint;
  downloadUrl: string;
  publishedAt: Date;
  publishedByStaffId: string | null;
  channel: AcarsReleaseChannel;
};

export async function getLatestAcarsRelease(channel: AcarsReleaseChannel = "STABLE"): Promise<AcarsRelease | null> {
  try {
    const rows = await prisma.$queryRaw<ReleaseRow[]>`
      SELECT "product", "version", "notes", "mandatory", "fileName", "fileSize", "downloadUrl", "publishedAt", "publishedByStaffId", "channel"
      FROM "SoftwareRelease"
      WHERE "product" = 'HISPAFLY_ACARS' AND "channel" = ${channel}
      ORDER BY "publishedAt" DESC
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return null;
    return {
      product: row.product,
      version: row.version,
      notes: row.notes,
      mandatory: row.mandatory,
      fileName: row.fileName,
      fileSize: Number(row.fileSize),
      downloadUrl: row.downloadUrl,
      publishedAt: row.publishedAt.toISOString(),
      publishedByStaffId: row.publishedByStaffId ?? undefined,
      channel: row.channel,
    };
  } catch {
    return null;
  }
}

export async function getAcarsReleaseChannel(version: string): Promise<AcarsReleaseChannel | null> {
  const rows = await prisma.$queryRaw<Array<{ channel: AcarsReleaseChannel }>>`
    SELECT "channel" FROM "SoftwareRelease"
    WHERE "product" = 'HISPAFLY_ACARS' AND "version" = ${version}
    LIMIT 1
  `;
  return rows[0]?.channel ?? null;
}

export function formatReleaseSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  return `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }).format(bytes / 1024 / 1024)} MB`;
}
