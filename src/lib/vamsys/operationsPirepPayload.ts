export type OperationsPirepRecord = Record<string, unknown>;

const completedStatuses = new Set(["accepted", "approved", "completed", "complete"]);

function record(value: unknown): OperationsPirepRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as OperationsPirepRecord
    : null;
}

function text(value: OperationsPirepRecord, ...keys: string[]): string | null {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" || typeof candidate === "number") return String(candidate);
  }
  return null;
}

export function mergeOperationsPirepRecords(
  summary: OperationsPirepRecord,
  detail: OperationsPirepRecord,
): OperationsPirepRecord {
  const summaryAttributes = record(summary.attributes) ?? {};
  const detailAttributes = record(detail.attributes) ?? {};
  return {
    ...summaryAttributes,
    ...summary,
    ...detailAttributes,
    ...detail,
    attributes: { ...summaryAttributes, ...detailAttributes },
  };
}

export function operationsPirepStatus(raw: OperationsPirepRecord): string | null {
  const attributes = record(raw.attributes);
  const status = text(raw, "status", "state", "pirep_status")
    ?? (attributes ? text(attributes, "status", "state", "pirep_status") : null);
  return status?.trim().toLowerCase().replace(/[\s-]+/g, "_") ?? null;
}

export function isCompletedOperationsPirep(raw: OperationsPirepRecord): boolean {
  const status = operationsPirepStatus(raw);
  return status !== null && completedStatuses.has(status);
}
