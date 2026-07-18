import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");
const airportService = read("./airport.ts");
const routeCreatePage = read("../../app/staff/routes/new/page.tsx");
const routeEditPage = read("../../app/staff/routes/[id]/edit/page.tsx");
const airportDetailPage = read("../../app/staff/airports/[id]/page.tsx");
const cutoverService = read("../native-cutover/service.ts");
const schema = read("../../../prisma/schema.prisma");
const migration = read("../../../prisma/migrations/20260718120000_unified_airport_identity/migration.sql");

// LEMD-style imported airports remain the same row and are not write-gated.
assert.doesNotMatch(airportService, /Legacy airports are read-only|editableOrigins/);
assert.match(airportService, /findUnique\(\{ where: \{ icao: data\.icao \} \}\)/);
assert.match(airportService, /findFirst\(\{ where: \{ icao: data\.icao, id: \{ not: id \} \} \}\)/);
assert.match(airportService, /action: "AIRPORT_UPDATED"/);
assert.match(airportService, /action: status === "ARCHIVED" \? "AIRPORT_ARCHIVED" : "AIRPORT_STATUS_CHANGED"/);

// Route selectors include every active airport, regardless of provenance.
for (const page of [routeCreatePage, routeEditPage]) {
  assert.match(page, /airport\.findMany\(\{ where: \{ status: "ACTIVE" \}/);
  const airportQuery = page.match(/prisma\.airport\.findMany\([^\n]+/)?.[0] ?? "";
  assert.doesNotMatch(airportQuery, /dataOrigin|VAMSYS_LEGACY/);
}

// Imported provenance is displayed as metadata and no longer disables controls.
assert.match(airportDetailPage, /provenance metadata only/);
assert.doesNotMatch(airportDetailPage, /dataOrigin !== "VAMSYS_LEGACY"/);
assert.match(cutoverService, /entityType === "Airport"[\s\S]{0,120}where: \{ id: targetNativeId \}/);
assert.doesNotMatch(cutoverService, /entityType === "Airport"[\s\S]{0,160}dataOrigin: "HISPAFLY_NATIVE"/);

// One Airport model, one ICAO identity, with migration guards that preserve IDs.
assert.equal((schema.match(/model Airport \{/g) ?? []).length, 1);
assert.match(schema, /icao\s+String\s+@unique/);
assert.match(migration, /GROUP BY UPPER\("icao"\)/);
assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS "Airport_icao_normalized_key"/);
assert.doesNotMatch(migration, /UPDATE\s+"Airport"|DELETE\s+FROM\s+"Airport"/i);

console.log("Unified airport identity tests passed.");
