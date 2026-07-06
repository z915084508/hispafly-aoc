export interface DispatchReleaseItem { key: string; label: string; status: string; detail: string; }

export function dispatchReleaseItems(value: unknown): DispatchReleaseItem[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const items = (value as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  return items.filter((item): item is DispatchReleaseItem => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const row = item as Record<string, unknown>;
    return [row.key, row.label, row.status, row.detail].every((part) => typeof part === "string");
  });
}

export function dispatchReleaseMessages(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
