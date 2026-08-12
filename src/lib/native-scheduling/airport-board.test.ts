import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  buildAirportBoardMovements,
  formatUtcMinutes,
  parseAirportBoardDate,
  timelinePositionPercent,
  type AirportBoardSchedule,
} from "./airport-board.ts";

const schedule = (overrides: Partial<AirportBoardSchedule> & Pick<AirportBoardSchedule, "id">): AirportBoardSchedule => ({
  id: overrides.id,
  code: overrides.code ?? overrides.id,
  status: overrides.status ?? "ACTIVE",
  daysOfWeek: overrides.daysOfWeek ?? [1],
  departureTimeMinutesUtc: overrides.departureTimeMinutesUtc ?? 480,
  arrivalTimeMinutesUtc: overrides.arrivalTimeMinutesUtc ?? 540,
  scheduledDurationMinutes: overrides.scheduledDurationMinutes ?? 60,
  effectiveFrom: overrides.effectiveFrom ?? new Date("2026-08-01T00:00:00.000Z"),
  effectiveUntil: overrides.effectiveUntil ?? null,
  route: overrides.route ?? { departure: "LEMD", arrival: "LEVC", flightNumber: "HF100" },
});

const monday = parseAirportBoardDate("2026-08-03");
const movements = buildAirportBoardMovements([
  schedule({ id: "arrival", route: { departure: "LEMD", arrival: "LEVC", flightNumber: "HF100" } }),
  schedule({ id: "departure", departureTimeMinutesUtc: 600, arrivalTimeMinutesUtc: 660, route: { departure: "LEVC", arrival: "LEMD", flightNumber: "HF101" } }),
  schedule({
    id: "overnight",
    daysOfWeek: [7],
    departureTimeMinutesUtc: 1410,
    arrivalTimeMinutesUtc: 60,
    scheduledDurationMinutes: 90,
    route: { departure: "LEBL", arrival: "LEVC", flightNumber: "HF200" },
  }),
  schedule({ id: "wrong-day", daysOfWeek: [2], route: { departure: "LEMD", arrival: "LEVC", flightNumber: "HF300" } }),
], "LEVC", monday);

assert.deepEqual(movements.map((movement) => [movement.schedule.id, movement.direction, movement.timeMinutesUtc]), [
  ["overnight", "ARRIVAL", 60],
  ["arrival", "ARRIVAL", 540],
  ["departure", "DEPARTURE", 600],
]);
assert.equal(movements[0].scheduleOperatingDateUtc.toISOString().slice(0, 10), "2026-08-02");
assert.equal(formatUtcMinutes(75), "01:15");
assert.equal(formatUtcMinutes(1500), "01:00");
assert.equal(timelinePositionPercent(720), 50);
assert.equal(timelinePositionPercent(-10) > 99, true);

const expired = buildAirportBoardMovements([
  schedule({ id: "expired", effectiveUntil: new Date("2026-08-02T00:00:00.000Z") }),
], "LEVC", monday);
assert.equal(expired.length, 0);

const boardPage = readFileSync(fileURLToPath(new URL("../../app/staff/operations/airport-programacion/page.tsx", import.meta.url)), "utf8");
const routeCatalog = readFileSync(fileURLToPath(new URL("../../components/programacion/airport-route-catalog.tsx", import.meta.url)), "utf8");
const newPage = readFileSync(fileURLToPath(new URL("../../app/staff/operations/programacion/new/page.tsx", import.meta.url)), "utf8");
const actions = readFileSync(fileURLToPath(new URL("../../app/staff/operations/programacion/actions.ts", import.meta.url)), "utf8");
assert.match(routeCatalog, /PROGRAMAR ESTE TRAMO/);
assert.match(routeCatalog, /groupRoutePairs/);
assert.match(routeCatalog, /Falta configurar el tramo inverso/);
assert.match(boardPage, /AircraftOperationsTable/);
assert.match(boardPage, /title="Llegadas" direction="ARRIVAL"/);
assert.match(boardPage, /title="Salidas" direction="DEPARTURE"/);
assert.match(boardPage, /Una fila por aeronave/);
assert.match(boardPage, /SIN ASIGNAR/);
assert.match(boardPage, /routeId=\$\{route\.id\}/);
assert.match(newPage, /selectedRoute\?\.defaultFleetId/);
assert.match(newPage, /airport-programacion/);
assert.match(actions, /createdScheduleId/);

console.log("Airport Programacion planning workflow: 18 assertions passed.");
