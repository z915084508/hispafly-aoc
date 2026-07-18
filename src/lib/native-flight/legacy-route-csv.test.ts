import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseVamsysRouteCsv } from "./legacy-route-csv-parser.ts";

const sample = '\uFEFFID,"Departure Airport (ICAO/IATA)","Arrival Airport (ICAO/IATA)","Flight Number",Callsign,"Fleet IDs",Routing\r\n5844567,LEMH,LEPA,HF1213,HPF77MP,"8133, 8146","MAMEB, DCT"\r\n';
assert.deepEqual(parseVamsysRouteCsv(sample), [{ ID: "5844567", "Departure Airport (ICAO/IATA)": "LEMH", "Arrival Airport (ICAO/IATA)": "LEPA", "Flight Number": "HF1213", Callsign: "HPF77MP", "Fleet IDs": "8133, 8146", Routing: "MAMEB, DCT" }]);

const service = readFileSync(new URL("./legacy-route-csv.ts", import.meta.url), "utf8");
assert.match(service, /upsert\(\{ where: \{ vamsysRouteId:/);
assert.match(service, /dataOrigin: "VAMSYS_LEGACY"/);
assert.match(service, /LEGACY_ROUTE_CSV_IMPORTED/);
assert.doesNotMatch(service, /fetch\(|@\/lib\/vamsys\/routes\/client/);
console.log("Legacy Route CSV parsing and safety tests passed.");
