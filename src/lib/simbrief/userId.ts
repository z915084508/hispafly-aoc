export function normalizeSimbriefUserId(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  if (normalized.length > 64 || !/^[A-Za-z0-9_-]+$/.test(normalized)) throw new Error("Invalid SimBrief Pilot ID.");
  return normalized;
}

export function simbriefUrlWithUserId(url: string | null | undefined, userId: string | null | undefined) {
  if (!url || !userId) return url ?? null;
  try { const target = new URL(url); target.searchParams.set("userid", userId); return target.toString(); }
  catch { return url; }
}
