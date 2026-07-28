import { list } from "@vercel/blob";

export type AcarsRelease = {
  product: string;
  version: string;
  notes: string;
  mandatory: boolean;
  fileName: string;
  fileSize: number;
  downloadUrl: string;
  blobUrl: string;
  pathname: string;
  publishedAt: string;
  publishedByStaffId?: string;
};

export async function getLatestAcarsRelease(): Promise<AcarsRelease | null> {
  try {
    const result = await list({ prefix: "software/acars/latest.json", limit: 1 });
    const manifest = result.blobs[0];
    if (!manifest) return null;
    const response = await fetch(manifest.url, { cache: "no-store" });
    if (!response.ok) return null;
    return await response.json() as AcarsRelease;
  } catch {
    return null;
  }
}

export function formatReleaseSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  return `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }).format(bytes / 1024 / 1024)} MB`;
}
