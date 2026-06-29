type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function text(value: JsonRecord | null, ...keys: string[]): string | null {
  if (!value) return null;
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" || typeof candidate === "number") return String(candidate);
  }
  return null;
}

/** Supports both vAMSYS cursor metadata and JSON:API pagination links. */
export function nextVamsysCursor(payload: JsonRecord): string | null {
  const direct = text(payload, "next_cursor", "nextCursor")
    ?? text(record(payload.meta), "next_cursor", "nextCursor");
  if (direct) return direct;

  const next = text(record(payload.links), "next");
  if (!next) return null;
  try {
    const url = new URL(next, "https://vamsys.invalid");
    return url.searchParams.get("page[cursor]") ?? url.searchParams.get("cursor");
  } catch {
    return null;
  }
}

/** Returns the API-provided next-page URL when pagination is URL based. */
export function nextVamsysPageUrl(payload: JsonRecord): string | null {
  const meta = record(payload.meta);
  return text(record(payload.links), "next")
    ?? text(meta, "next_cursor_url", "nextCursorUrl", "next_page_url", "nextPageUrl");
}
