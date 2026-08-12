import type { FlightScheduleStatus, Prisma } from "@prisma/client";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  addUtcDays,
  buildAirportBoardMovements,
  formatUtcMinutes,
  parseAirportBoardDate,
  timelinePositionPercent,
  type AirportBoardMovement,
} from "@/lib/native-scheduling/airport-board";
import { getTranslations } from "@/lib/i18n/server";
import { getCurrentStaff } from "@/lib/staff/currentStaff";
import { staffHasPermission } from "@/lib/staff/permissions";

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
        <h1>Programación por aeropuerto</h1>
        <p>Consulta en un solo tablero la Programación vigente de llegadas y salidas de cada aeropuerto. Los horarios se muestran en UTC y no incluyen seguimiento en tiempo real.</p>
      </div>
      <div className="button-row">{canCreate && selectedAirport && <Link className="button" href={`/staff/operations/programacion/new?departure=${selectedAirport.icao}&effectiveFrom=${dateValue(selectedDate)}`}>+ PROGRAMAR SALIDA</Link>}<Link className="button secondary" href="/staff/operations/programacion">ROTACIÓN Y GESTIÓN</Link></div>
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

    <div className="airport-board-ruler" aria-label="Escala horaria UTC">
      {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((hour) => <span key={hour}>{String(hour).padStart(2, "0")}:00</span>)}
    </div>

    <div className="airport-board-columns">
      <MovementColumn
        title="Llegadas"
        copy="Programaciones cuyo destino es el aeropuerto seleccionado"
        movements={arrivals}
      />
      <MovementColumn
        title="Salidas"
        copy="Programaciones cuyo origen es el aeropuerto seleccionado"
        movements={departures}
      />
    </div>

    {query.saved && <div className="notice success">PROGRAMACIÓN guardada como borrador.{query.createdScheduleId && <> <Link href={`/staff/operations/programacion/${query.createdScheduleId}`}>Abrir detalle →</Link></>}</div>}

    <section className="airport-movement-column">
      <header><div><h2>Red de rutas de {selectedAirport?.icao ?? "aeropuerto"}</h2><p>Selecciona una ruta, define el horario y asigna primero la flota. La aeronave concreta sigue siendo opcional.</p></div><strong>{airportRoutes.length}</strong></header>
      {!airportRoutes.length ? <div className="airport-board-empty">Este aeropuerto no tiene rutas operativas configuradas.</div> : <div className="airport-movement-list">{airportRoutes.map((route) => {
        const direction = route.departureAirportId === selectedAirport?.id ? "SALIDA" : "LLEGADA";
        const returnTo = `/staff/operations/airport-programacion?airportId=${selectedAirport?.id}&date=${dateValue(selectedDate)}`;
        const target = `/staff/operations/programacion/new?routeId=${route.id}&effectiveFrom=${dateValue(selectedDate)}&returnTo=${encodeURIComponent(returnTo)}`;
        return <article className="airport-movement-card" key={route.id}><div className="airport-movement-head"><strong>{route.flightNumber ?? route.routeCode ?? "Sin número"}</strong><span className="airport-schedule-status active">{direction}</span></div><div className="airport-movement-route"><strong>{route.departure}</strong><span>→</span><strong>{route.arrival}</strong></div><div className="airport-movement-meta"><div><span>Flota propuesta</span><strong>{route.defaultFleet?.code ?? route.defaultFleet?.name ?? "Sin flota fija"}</strong></div><div><span>PROGRAMACIÓN actual</span><strong>{route.schedules.length || "NINGUNA"}</strong></div></div>{canCreate && <div className="airport-movement-actions"><Link className="button" href={target}>PROGRAMAR ESTA RUTA →</Link></div>}</article>;
      })}</div>}
    </section>

    <p className="airport-board-note">El tablero se construye exclusivamente con FlightSchedule y Route. No consulta posiciones ACARS, retrasos, puertas ni puestos de estacionamiento. Las llegadas posteriores a medianoche se asignan correctamente al día de llegada.</p>
  </div>;
}

function SummaryCard({ label, value, note }: { label: string; value: number; note: string }) {
  return <div className="airport-board-kpi"><span>{label}</span><strong>{value}</strong><small>{note}</small></div>;
}

function MovementColumn({
  title,
  copy,
  movements,
}: {
  title: string;
  copy: string;
  movements: BoardMovement[];
}) {
  return <section className="airport-movement-column">
    <header><div><h2>{title}</h2><p>{copy}</p></div><strong>{movements.length}</strong></header>
    {!movements.length
      ? <div className="airport-board-empty">No hay Programación para esta fecha y este filtro.</div>
      : <div className="airport-movement-list">{movements.map((movement) => <MovementCard key={`${movement.direction}-${movement.schedule.id}`} movement={movement}/>)}</div>}
  </section>;
}

function MovementCard({ movement }: { movement: BoardMovement }) {
  const { schedule } = movement;
  const time = formatUtcMinutes(movement.timeMinutesUtc);
  const position = timelinePositionPercent(movement.timeMinutesUtc);
  const directionClass = movement.direction === "ARRIVAL" ? "arrival" : "departure";
  const fleet = schedule.defaultFleet?.code ?? schedule.defaultFleet?.name ?? "Flota libre";
  const aircraft = schedule.assignedAircraft?.registration ?? "Sin aeronave";

  return <article className={`airport-movement-card ${directionClass}`}>
    <div className="airport-movement-head">
      <div className="airport-movement-time"><strong>{time}</strong><span>UTC</span></div>
      <span className={`airport-schedule-status ${schedule.status.toLowerCase()}`}>{STATUS_LABELS[schedule.status] ?? schedule.status}</span>
    </div>
    <div className="airport-movement-flight">
      <strong>{schedule.route.flightNumber ?? schedule.code}</strong>
      <span>{schedule.route.callsign ?? schedule.code}</span>
    </div>
    <div className="airport-movement-route">
      <strong>{schedule.route.departure}</strong><span>→</span><strong>{schedule.route.arrival}</strong>
    </div>
    <div className="airport-movement-meta">
      <div><span>Programación</span><strong>{schedule.code}</strong></div>
      <div><span>Flota</span><strong>{fleet}</strong></div>
      <div><span>Aeronave</span><strong>{aircraft}</strong></div>
    </div>
    <div className="airport-time-progress" aria-label={`${time} UTC dentro del día`}>
      <span className="airport-time-progress-fill" style={{ width: `${position}%` }}/>
      <i className="airport-time-progress-marker" style={{ left: `${position}%` }}/>
    </div>
    <div className="airport-time-progress-scale"><span>00:00</span><strong>{time}</strong><span>24:00</span></div>
    <div className="airport-movement-actions"><Link href={`/staff/operations/programacion/${schedule.id}`}>ABRIR PROGRAMACIÓN →</Link></div>
  </article>;
}
