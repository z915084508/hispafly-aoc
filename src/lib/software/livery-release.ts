import { prisma } from "@/lib/prisma";

export const LIVERY_PRODUCT_PREFIX = "HISPAFLY_LIVERY|";
export type LiverySimulator = "MSFS2020" | "MSFS2024";

export type LiveryRelease = {
  product: string;
  version: string;
  notes: string;
  fileName: string;
  fileSize: number;
  downloadUrl: string;
  publishedAt: string;
  publishedByStaffId?: string;
  aircraftType: string;
  addon: string;
  simulator: LiverySimulator;
  registration?: string;
};

type ReleaseRow = {
  product: string;
  version: string;
  notes: string;
  fileName: string;
  fileSize: bigint;
  downloadUrl: string;
  publishedAt: Date;
  publishedByStaffId: string | null;
};

const normalizeField = (value: string) => value.trim().replace(/\s+/g, " ");

export function buildLiveryProduct(input: {
  aircraftType: string;
  addon: string;
  simulator: LiverySimulator;
  registration?: string | null;
}) {
  const aircraftType = normalizeField(input.aircraftType).toUpperCase();
  const addon = normalizeField(input.addon);
  const registration = normalizeField(input.registration ?? "").toUpperCase();
  return `${LIVERY_PRODUCT_PREFIX}${encodeURIComponent(aircraftType)}|${encodeURIComponent(addon)}|${input.simulator}|${encodeURIComponent(registration)}`;
}

export function parseLiveryProduct(product: string) {
  if (!product.startsWith(LIVERY_PRODUCT_PREFIX)) return null;
  const [aircraftTypeRaw, addonRaw, simulatorRaw, registrationRaw = ""] = product.slice(LIVERY_PRODUCT_PREFIX.length).split("|");
  if (!aircraftTypeRaw || !addonRaw || !["MSFS2020", "MSFS2024"].includes(simulatorRaw)) return null;
  try {
    return {
      aircraftType: decodeURIComponent(aircraftTypeRaw),
      addon: decodeURIComponent(addonRaw),
      simulator: simulatorRaw as LiverySimulator,
      registration: registrationRaw ? decodeURIComponent(registrationRaw) : undefined,
    };
  } catch {
    return null;
  }
}

export async function getLatestLiveryReleases(): Promise<LiveryRelease[]> {
  try {
    const prefix = `${LIVERY_PRODUCT_PREFIX}%`;
    const rows = await prisma.$queryRaw<ReleaseRow[]>`
      SELECT DISTINCT ON ("product")
        "product", "version", "notes", "fileName", "fileSize", "downloadUrl", "publishedAt", "publishedByStaffId"
      FROM "SoftwareRelease"
      WHERE "product" LIKE ${prefix} AND "channel" = 'STABLE'
      ORDER BY "product", "publishedAt" DESC
    `;

    return rows.flatMap((row) => {
      const identity = parseLiveryProduct(row.product);
      if (!identity) return [];
      return [{
        product: row.product,
        version: row.version,
        notes: row.notes,
        fileName: row.fileName,
        fileSize: Number(row.fileSize),
        downloadUrl: row.downloadUrl,
        publishedAt: row.publishedAt.toISOString(),
        publishedByStaffId: row.publishedByStaffId ?? undefined,
        ...identity,
      } satisfies LiveryRelease];
    }).sort((a, b) => {
      const aircraft = a.aircraftType.localeCompare(b.aircraftType);
      if (aircraft) return aircraft;
      const addon = a.addon.localeCompare(b.addon);
      if (addon) return addon;
      return (a.registration ?? "").localeCompare(b.registration ?? "");
    });
  } catch {
    return [];
  }
}
