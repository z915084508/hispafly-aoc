type MetricRecord = Record<string, unknown>;

type MetricMatch = {
  value: number;
  key: string;
  path: string;
};

export type ExtractedPirepMetrics = {
  fuelUsedKg: number | null;
  cargoKg: number | null;
  fuelField: string | null;
  cargoField: string | null;
};

const FUEL_KEYS = new Set([
  "fuel_used",
  "fuelused",
  "fuel_used_kg",
  "fuelusedkg",
  "fuel_kg",
  "fuelkg",
  "fuel_burned",
  "fuelburned",
  "fuel_burned_kg",
  "fuelburnedkg",
  "block_fuel",
  "blockfuel",
  "block_fuel_kg",
  "blockfuelkg",
  "trip_fuel",
  "tripfuel",
  "trip_fuel_kg",
  "tripfuelkg",
  "used_fuel",
  "usedfuel",
]);

const CARGO_KEYS = new Set([
  "cargo",
  "cargo_kg",
  "cargokg",
  "cargo_weight",
  "cargoweight",
  "freight",
  "freight_kg",
  "freightkg",
  "freight_weight",
  "freightweight",
  "payload_cargo",
  "payloadcargo",
  "payload_cargo_kg",
  "payloadcargokg",
]);

const normalizeKey = (key: string) => key.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
const compactKey = (key: string) => normalizeKey(key).replace(/_/g, "");

function isRecord(value: unknown): value is MetricRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const cleaned = value
    .trim()
    .replace(/,/g, ".")
    .match(/-?\d+(?:\.\d+)?/u)?.[0];
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function maybeConvertToKg(value: number, keyOrPath: string): number {
  const lower = keyOrPath.toLowerCase();
  if (/(^|[_\.\s-])(lb|lbs|pound|pounds)([_\.\s-]|$)/u.test(lower)) return value * 0.45359237;
  return value;
}

function findMetric(root: unknown, keys: Set<string>, maxDepth = 7): MetricMatch | null {
  const seen = new Set<unknown>();
  const queue: Array<{ value: unknown; path: string; depth: number }> = [{ value: root, path: "payload", depth: 0 }];

  while (queue.length) {
    const current = queue.shift();
    if (!current || current.depth > maxDepth) continue;
    const { value, path, depth } = current;

    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index++) queue.push({ value: value[index], path: `${path}[${index}]`, depth: depth + 1 });
      continue;
    }

    if (!isRecord(value) || seen.has(value)) continue;
    seen.add(value);

    for (const [key, candidate] of Object.entries(value)) {
      const normalized = normalizeKey(key);
      const compact = compactKey(key);
      const keyMatches = keys.has(normalized) || keys.has(compact);
      const childPath = `${path}.${key}`;

      if (keyMatches) {
        const parsed = parseNumber(candidate);
        if (parsed !== null && parsed >= 0) return { value: Math.round(maybeConvertToKg(parsed, childPath)), key, path: childPath };
      }

      if (candidate !== null && typeof candidate === "object") queue.push({ value: candidate, path: childPath, depth: depth + 1 });
    }
  }

  return null;
}

export function extractVamsysPirepMetrics(payload: unknown): ExtractedPirepMetrics {
  const fuel = findMetric(payload, FUEL_KEYS);
  const cargo = findMetric(payload, CARGO_KEYS);

  return {
    fuelUsedKg: fuel?.value ?? null,
    cargoKg: cargo?.value ?? null,
    fuelField: fuel?.path ?? null,
    cargoField: cargo?.path ?? null,
  };
}
