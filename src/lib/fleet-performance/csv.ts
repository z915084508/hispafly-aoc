export const PERFORMANCE_COLUMNS = [
  "fleetKey", "fleetName", "aircraftType", "aircraftCount", "seatCapacity", "cargoCapacityKg", "operatingEmptyWeightKg",
  "maxZeroFuelWeightKg", "maxTakeoffWeightKg", "maxLandingWeightKg", "maxFuelKg",
  "maxPayloadKg", "defaultCostIndex", "fuelBiasPercent", "taxiFuelKg", "locked", "notes",
] as const;

export type PerformanceCsvRow = Record<(typeof PERFORMANCE_COLUMNS)[number], string>;

const escapeCell = (value: unknown) => {
  const text = value == null ? "" : String(value);
  const safe = /^[=+@]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
};

export function createPerformanceCsv(rows: Array<Record<string, unknown>>) {
  return `\uFEFF${[PERFORMANCE_COLUMNS.join(","), ...rows.map((row) => PERFORMANCE_COLUMNS.map((column) => escapeCell(row[column])).join(","))].join("\r\n")}`;
}

export function parsePerformanceCsv(input: string): PerformanceCsvRow[] {
  const text = input.replace(/^\uFEFF/, "");
  const records: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; index++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\n") { row.push(cell.replace(/\r$/, "")); records.push(row); row = []; cell = ""; }
    else cell += char;
  }
  if (quoted) throw new Error("The CSV contains an unclosed quoted value.");
  if (cell || row.length) { row.push(cell.replace(/\r$/, "")); records.push(row); }
  const [headers, ...data] = records;
  if (!headers) throw new Error("The uploaded file is empty.");
  const normalizedHeaders = headers.map((header) => header.trim());
  const missing = PERFORMANCE_COLUMNS.filter((column) => !normalizedHeaders.includes(column));
  if (missing.length) throw new Error(`Missing columns: ${missing.join(", ")}`);
  return data.filter((values) => values.some((value) => value.trim())).map((values) => Object.fromEntries(PERFORMANCE_COLUMNS.map((column) => [column, values[normalizedHeaders.indexOf(column)]?.trim() ?? ""])) as PerformanceCsvRow);
}
