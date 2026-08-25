import type { FlightScheduleStatus, Prisma } from "@prisma/client";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  addUtcDays,
  buildAirportBoardMovements,
  formatUtcMinutes,
  parseAirportBoardDate,
  type AirportBoardMovement,
} from "@/lib/native-scheduling/airport-board";
import { getTranslations } from "@/lib/i18n/server";
import { getCurrentStaff } from "@/lib/staff/currentStaff";
import { staffHasPermission } from "@/lib/staff/permissions";
import { AirportRouteCatalog } from "@/components/programacion/airport-route-catalog";
import { AirportMovementTimeline } from "@/components/programacion/airport-movement-timeline";

const scheduleInclude = {
  route: true,
  defaultFleet: true,
  assignedAircraft: true,
} satisfies Prisma.FlightScheduleInclude;

type ScheduleRow = Prisma.FlightScheduleGetPayload<{ include: typeof scheduleInclude }>;
type BoardMovement = AirportBoardMovement<ScheduleRow>;

const BOARD_STATUSES = ["DRAFT", "ACTIVE", "SUSPENDED", "EXPIRED"] as const satisfies readonly FlightScheduleStatus[];
const STATUS_LABELS: Record<string, string> = {
  DRAFT: "BORRADOR",
  ACTIVE: "PUBLICADA",
  SUSPENDED: "SUSPENDIDA",
  EXPIRED: "EXPIRADA",
};

const dateValue = (date: Date) => date.toISOString().slice(0, 10);

function selectedStatus(value?: string): FlightScheduleStatus | undefined {
  return BOARD_STATUSES.includes(value as (typeof BOARD_STATUSES)[number]) ? value as FlightScheduleStatus : undefined;
}

export default async function AirportProgramacionBoard({
  searchParams,
}: {
  searchParams: Promise<{ airportId?: string; date?: string; status?: string; saved?: string; createdScheduleId?: string }>;
}) {
  const [query, airports, translations, staff] = await Promise.all([
    searchParams,
    prisma.airport.findMany({
      where: { status: "ACTIVE" },
      orderBy: { icao: "asc" },
      select: { id: true, icao: true, iata: true, name: true, city: true },
    }),
    getTranslations(),
    getCurrentStaff(),
  ]);

  const selectedDate = parseAirportBoardDate(query.date);
  const status = selectedStatus(query.status);
  const selectedAirport = airports.find((airport) => airport.id === query.airportId)
    ?? airports.find((airport) => airport.icao === "LEVC")
    ?? airports[0]
    ?? null;

  const schedules = selectedAirport ? await prisma.flightSchedule.findMany({
    where: {
      ...(status ? { status } : { status: { not: "ARCHIVED" } }),
      effectiveFrom: { lte: selectedDate },
      OR: [
        { effectiveUntil: null },
        { effectiveUntil: { gte: addUtcDays(selectedDate, -1) } },
      ],
      route: {
        OR: [
          { departure: selectedAirport.icao },
          { arrival: selectedAirport.icao },
        ],
      },
    },
    include: scheduleInclude,
    orderBy: [
      { departureTimeMinutesUtc: "asc" },
      { code: "asc" },
    ],
  }) : [];
  const airportRoutes = selectedAirport ? await prisma.route.findMany({
    where: { active: true, archivedAt: null, operationalStatus: "ACTIVE", OR: [{ departureAirportId: selectedAirport.id }, { arrivalAirportId: selectedAirport.id }] },
    include: { defaultFleet: true, schedules: { where: { status: { not: "ARCHIVED" } }, select: { id: true, status: true } } },
    orderBy: [{ departure: "asc" }, { arrival: "asc" }, { flightNumber: "asc" }],
  }) : [];
  const canCreate = staffHasPermission(staff, "SCHEDULE_CREATE");

  const movements = selectedAirport
    ? buildAirportBoardMovements(schedules, selectedAirport.icao, selectedDate)
    : [];
  const arrivals = movements.filter((movement) => movement.direction === "ARRIVAL");
  const departures = movements.filter((movement) => movement.direction === "DEPARTURE");
  const active = movements.filter((movement) => movement.schedule.status === "ACTIVE").length;
  const drafts = movements.filter((movement) => movement.schedule.status === "DRAFT").length;
  const locale = translations.locale === "en" ? "en-GB" : "es-ES";
  const selectedDateLabel = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(selectedDate);

  return <div className="airport-programacion-page">
    <div className="page-header airport-programacion-header">
      <div>
        <div className="eyebrow">OPERACIONES · PROGRAMACIÓN</div>
        <h1>Airport Slot Rotation</h1>
        <p>Timeline operativo por aeropuerto y fecha: cada llegada y salida ocupa un slot de la programación. Los horarios se muestran en UTC.</p>
      </div>
      <div className="button-row">{canCreate && selectedAirport && <Link className="button" href={`/staff/operations/programacion/new?departure=${selectedAirport.icao}&effectiveFrom=${dateValue(selectedDate)}`}>+ PROGRAMAR SALIDA</Link>}<Link className="button secondary" href="/staff/operations/programacion">GESTIONAR PROGRAMACIÓN</Link></div>
    </div>

    <form className="airport-board-filters">
      <label>Aeropuerto
        <select name="airportId" defaultValue={selectedAirport?.id ?? ""}>
          {!airports.length && <option value="">No hay aeropuertos activos</option>}
          {airports.map((airport) => <option key={airport.id} value={airport.id}>
            {airport.icao}{airport.iata ? ` / ${airport.iata}` : ""} · {airport.name ?? airport.city ?? "Sin nombre"}
          </option>)}
        </select>
      </label>
      <label>Fecha UTC<input name="date" type="date" defaultValue={dateValue(selectedDate)}/></label>
      <label>Estado
        <select name="status" defaultValue={status ?? ""}>
          <option value="">Todos salvo archivados</option>
          {BOARD_STATUSES.map((item) => <option key={item} value={item}>{STATUS_LABELS[item]}</option>)}
        </select>
      </label>
      <button className="button" type="submit">MOSTRAR TABLERO</button>
    </form>

    <section className="airport-board-summary" aria-label="Resumen de Programación">
      <SummaryCard label="Movimientos" value={movements.length} note={selectedDateLabel}/>
      <SummaryCard label="Llegadas" value={arrivals.length} note={selectedAirport?.icao ?? "—"}/>
      <SummaryCard label="Salidas" value={departures.length} note={selectedAirport?.icao ?? "—"}/>
      <SummaryCard label="Publicadas" value={active} note="Estado ACTIVE"/>
      <SummaryCard label="Borradores" value={drafts} note="Estado DRAFT"/>
    </section>

    <AirportMovementTimeline movements={movements.map((movement) => ({ id:movement.schedule.id, direction:movement.direction, flightNumber:movement.schedule.route.flightNumber??movement.schedule.code, departure:movement.schedule.route.departure, arrival:movement.schedule.route.arrival, departureMinutesUtc:movement.schedule.departureTimeMinutesUtc, arrivalMinutesUtc:movement.schedule.arrivalTimeMinutesUtc, timeMinutesUtc:movement.timeMinutesUtc, durationMinutes:movement.schedule.scheduledDurationMinutes, fleet:movement.schedule.defaultFleet?.code??movement.schedule.defaultFleet?.name??movement.schedule.assignedAircraft?.aircraftType??"Sin flota fija", status:movement.schedule.status }))}/>
    <div className="airport-board-columns"><AircraftOperationsTable title="Llegadas" direction="ARRIVAL" movements={arrivals}/><AircraftOperationsTable title="Salidas" direction="DEPARTURE" movements={departures}/></div>

    {query.saved && <div className="notice success">PROGRAMACIÓN guardada como borrador.{query.createdScheduleId && <> <Link href={`/staff/operations/programacion/${query.createdScheduleId}`}>Abrir detalle →</Link></>}</div>}

    <section className="airport-movement-column">
      <header><div><h2>Red de rutas de {selectedAirport?.icao ?? "aeropuerto"}</h2><p>Cada conexión de ida y vuelta se muestra como una sola ruta. Selecciona el tramo que quieres programar.</p></div><strong>{new Set(airportRoutes.map((route) => [route.departure, route.arrival].sort().join("-"))).size}</strong></header>
      {!airportRoutes.length ? <div className="airport-board-empty">Este aeropuerto no tiene rutas operativas configuradas.</div> : <AirportRouteCatalog canCreate={canCreate} routes={airportRoutes.map((route) => {
        const returnTo = `/staff/operations/airport-programacion?airportId=${selectedAirport?.id}&date=${dateValue(selectedDate)}`;
        return { id: route.id, flightNumber: route.flightNumber, routeCode: route.routeCode, departure: route.departure, arrival: route.arrival, fleet: route.defaultFleet?.code ?? route.defaultFleet?.name ?? "Sin flota fija", scheduleCount: route.schedules.length, direction: route.departureAirportId === selectedAirport?.id ? "SALIDA" as const : "LLEGADA" as const, target: `/staff/operations/programacion/new?routeId=${route.id}&effectiveFrom=${dateValue(selectedDate)}&returnTo=${encodeURIComponent(returnTo)}` };
      })}/>} {/* route catalog */}
    </section>

    <p className="airport-board-note">El tablero se construye exclusivamente con FlightSchedule y Route. No consulta posiciones ACARS, retrasos, puertas ni puestos de estacionamiento. Las llegadas posteriores a medianoche se asignan correctamente al día de llegada.</p>
  </div>;
}

function SummaryCard({ label, value, note }: { label: string; value: number; note: string }) {
  return <div className="airport-board-kpi"><span>{label}</span><strong>{value}</strong><small>{note}</small></div>;
}

function AircraftOperationsTable({ title, direction, movements }: { title: string; direction: "ARRIVAL" | "DEPARTURE"; movements: BoardMovement[] }) {
  const grouped = new Map<string, { registration: string; mode: string; fleet: string; movements: BoardMovement[] }>();
  for (const movement of movements) {
    const aircraft = movement.schedule.assignedAircraft;
    const key = aircraft?.id ?? "unassigned";
    const row = grouped.get(key) ?? { registration: aircraft?.registration ?? "SIN ASIGNAR", mode: aircraft?.operationMode ?? "—", fleet: movement.schedule.defaultFleet?.code ?? movement.schedule.defaultFleet?.name ?? "Libre", movements: [] };
    row.movements.push(movement);
    grouped.set(key, row);
  }
  const rows = [...grouped.values()].sort((left, right) => left.registration === "SIN ASIGNAR" ? 1 : right.registration === "SIN ASIGNAR" ? -1 : left.registration.localeCompare(right.registration));
  const movementLabel = direction === "ARRIVAL" ? "Vuelos de llegada" : "Vuelos de salida";
  return <section className="airport-movement-column"><header><div><h2>{title}</h2><p>Una fila por aeronave.</p></div><strong>{rows.length}</strong></header>{!rows.length ? <div className="airport-board-empty">No hay PROGRAMACIÓN para esta fecha y este filtro.</div> : <div className="table-wrap"><table><thead><tr><th>Aeronave</th><th>Modo</th><th>Flota</th><th>{movementLabel}</th><th>Estado</th></tr></thead><tbody>{rows.map((row) => <tr key={row.registration}><td><strong>{row.registration}</strong></td><td><span className="badge">{row.mode}</span></td><td>{row.fleet}</td><td><MovementList movements={row.movements}/></td><td>{row.movements.some((movement)=>movement.schedule.status === "DRAFT") ? <span className="airport-schedule-status draft">BORRADOR</span> : <span className="airport-schedule-status active">PUBLICADA</span>}</td></tr>)}</tbody></table></div>}</section>;
}

function MovementList({ movements }: { movements: BoardMovement[] }) {
  if (!movements.length) return <span className="meta">—</span>;
  return <div>{movements.map((movement) => <div key={`${movement.direction}-${movement.schedule.id}`}><Link href={`/staff/operations/programacion/${movement.schedule.id}`}><strong>{formatUtcMinutes(movement.timeMinutesUtc)}</strong> · {movement.schedule.route.flightNumber ?? movement.schedule.code} · {movement.schedule.route.departure} → {movement.schedule.route.arrival}</Link></div>)}</div>;
}
