type JsonRecord = Record<string, unknown>;

const record = (value: unknown): JsonRecord | null => value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;

export function safeSimbriefPdfUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  if (!candidate || /^\/pilot\/ofp\//i.test(candidate) || (!candidate.includes("/") && /\.pdf(?:\?.*)?$/i.test(candidate))) return null;
  try {
    const url = new URL(candidate, "https://www.simbrief.com");
    const host = url.hostname.toLowerCase();
    if (!/^https?:$/.test(url.protocol) || !(host === "simbrief.com" || host.endsWith(".simbrief.com"))) return null;
    return url.toString();
  } catch { return null; }
}

export function extractSimbriefPdfUrl(snapshot: unknown): string | null {
  const root = record(snapshot);
  if (!root) return null;
  const files = record(root.files), pdf = record(files?.pdf), params = record(root.params);
  const expand = (value: unknown) => { const item = record(value); return item ? [item.link, item.url, item.href] : [value]; };
  const candidates = [root.pdfUrl, root.pdf_url, ...expand(root.ofp_pdf), ...expand(files?.pdf), pdf?.link, ...expand(params?.pdf)];
  for (const candidate of candidates) {
    const safe = safeSimbriefPdfUrl(candidate);
    if (safe) return safe;
  }
  return null;
}
