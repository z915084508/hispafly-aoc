import Link from "next/link";
import { PilotPortalShell } from "@/components/pilot-portal-shell";
import { requirePilotSession } from "@/lib/pilot/session";
import { loadPilotDepartures } from "@/lib/native-flight/departures-service";
import styles from "./flight-offers.module.css";

export const dynamic = "force-dynamic";

const labels = {
  AVAILABLE: "DISPONIBLE",
  MY_BOOKING: "YOUR FLIGHT",
  RESERVED: "RESERVED",
  UPCOMING: "PRÓXIMAMENTE",
  CLOSED: "CERRADO",
  CANCELLED: "CANCELADO",
  FINISHED: "FINALIZADO",
  WRONG_AIRPORT: "POSICIÓN REQUERIDA",
} as const;

const duration = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

const dateFromIso = (value: string) => new Date(`${value}T12:00:00.000Z`);

export default async function PilotFlightOffersPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const [session, query] = await Promise.all([requirePilotSession(), searchParams]);
  const result = await loadPilotDepartures(session.id, query.date);
  const airport = result.pilot.currentAirport;

  const utc = (date: Date) =>
    new Intl.DateTimeFormat("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: "UTC",
    }).format(date);

  const local = (date: Date) =>
    new Intl.DateTimeFormat("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: result.day.timeZone,
    }).format(date);

  const localDateKey = (date: Date) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: result.day.timeZone,
    }).formatToParts(date);
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}`;
  };

  const dayLabel = new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(dateFromIso(result.day.date));

  const dateLabel = (value: string) =>
    new Intl.DateTimeFormat("es-ES", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    }).format(dateFromIso(value));

  type Departure = (typeof result.flights)[number];

  const statusClass = (state: Departure["availability"]["state"]) => {
    if (state === "AVAILABLE" || state === "MY_BOOKING") return styles.statusAvailable;
    if (state === "RESERVED" || state === "UPCOMING") return styles.statusPending;
    if (state === "CANCELLED" || state === "CLOSED") return styles.statusUnavailable;
    return styles.statusNeutral;
  };

  const action = (flight: Departure) => {
    if (flight.availability.state === "MY_BOOKING") {
      return (
        <Link className={styles.reserveButton} href={`/pilot/bookings/${flight.availability.bookingId}`}>
          ABRIR MI RESERVA
        </Link>
      );
    }
    if (flight.availability.state === "AVAILABLE") {
      return (
        <Link className={styles.reserveButton} href={`/pilot/flight-offers/${flight.id}`}>
          REVISAR Y RESERVAR
        </Link>
      );
    }
    return (
      <Link className={styles.detailsLink} href={`/pilot/flight-offers/${flight.id}`}>
        VER VUELO
      </Link>
    );
  };

  const upcomingOnly = result.upcoming.filter(
    (flight) => localDateKey(flight.scheduledDeparture) !== result.day.date,
  );
  const upcomingGroups = [...Map.groupBy(upcomingOnly, (flight) => localDateKey(flight.scheduledDeparture))];

  return (
    <PilotPortalShell>
      <header className={styles.hero}>
        <div>
          <div className="eyebrow">PORTAL DE OPERACIONES</div>
          <h1>SELF DISPATCH</h1>
          <p>Selecciona una salida publicada o crea una operación adaptada a tu planificación.</p>
        </div>
      </header>

      <section className={styles.modeGrid}>
        <article className={`${styles.modeCard} ${styles.scheduledMode}`}>
          <div>
            <span className={styles.cardEyebrow}>VUELOS PROGRAMADOS</span>
            <h2>Opera desde tu posición actual</h2>
            <p>Consulta las salidas publicadas, revisa la aeronave asignada y reserva el vuelo.</p>
          </div>
          <a className={styles.modeAction} href="#salidas-programadas">
            {airport ? `VER SALIDAS DESDE ${airport.icao}` : "POSICIÓN PENDIENTE"}
            <span aria-hidden="true">→</span>
          </a>
        </article>

        <article className={`${styles.modeCard} ${styles.customMode}`}>
          <div>
            <span className={styles.cardEyebrow}>CREATE MY FLIGHT</span>
            <h2>Planifica tu propia operación</h2>
            <p>Elige una ruta, una aeronave disponible y tu hora prevista de salida.</p>
          </div>
          <Link className={styles.createButton} href="/pilot/flight-offers/self-dispatch">
            + CREAR MI VUELO
          </Link>
        </article>
      </section>

      {!airport ? (
        <section className={`${styles.emptyPosition} card`}>
          <div>
            <span className={styles.cardEyebrow}>POSICIÓN DE TRIPULACIÓN</span>
            <h2>Establece tu aeropuerto actual</h2>
            <p>Necesitas una posición válida antes de reservar o crear una operación.</p>
          </div>
          <Link className="button" href="/pilot/flight-offers/self-dispatch">
            ESTABLECER POSICIÓN
          </Link>
        </section>
      ) : (
        <>
          <section className={styles.positionCard}>
            <div className={styles.positionMain}>
              <span className={styles.cardEyebrow}>POSICIÓN DE TRIPULACIÓN</span>
              <strong>{airport.icao}</strong>
              <p>{airport.city || airport.name}</p>
            </div>
            <div className={styles.positionMeta}>
              <div>
                <span>ACTUALIZADA</span>
                <strong>
                  {result.pilot.positionUpdatedAt?.toISOString().slice(0, 16).replace("T", " · ") ||
                    "Sin fecha"}{" "}
                  UTC
                </strong>
              </div>
              <div>
                <span>ORIGEN</span>
                <strong>{result.pilot.positionSource || "Operaciones"}</strong>
              </div>
            </div>
            <nav className={styles.positionLinks} aria-label="Acciones de posición">
              <Link href="/pilot/flight-offers/self-dispatch">ACCESO JUMPSEAT</Link>
              <Link href={`/pilot/routes?airport=${airport.icao}`}>MAPA DE RUTAS</Link>
            </nav>
          </section>

          {result.day.fallback && (
            <div className="notice">
              La zona horaria del aeropuerto no es válida. Las fechas se muestran y consultan en UTC.
            </div>
          )}

          <section id="salidas-programadas" className={styles.departuresSection}>
            <header className={styles.departuresHeader}>
              <div>
                <span className={styles.cardEyebrow}>SALIDAS DESDE {airport.icao}</span>
                <h2>{dayLabel}</h2>
                <p>Horario principal en hora local · referencia UTC debajo</p>
              </div>
              <nav className={styles.dateNavigation} aria-label="Cambiar fecha de salidas">
                <Link href={`?date=${result.day.previous}`}>← ANTERIOR</Link>
                <Link className={styles.todayButton} href="/pilot/flight-offers">
                  HOY
                </Link>
                <Link href={`?date=${result.day.next}`}>SIGUIENTE →</Link>
              </nav>
            </header>

            <div className={styles.departuresCard}>
              {result.flights.length ? (
                <div className={styles.tableWrap}>
                  <table className={styles.departuresTable}>
                    <thead>
                      <tr>
                        <th>HORA</th>
                        <th>VUELO</th>
                        <th>DESTINO</th>
                        <th>LLEGADA</th>
                        <th>DURACIÓN</th>
                        <th>FLOTA</th>
                        <th>AERONAVE</th>
                        <th>ESTADO</th>
                        <th>ACCIÓN</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.flights.map((flight) => (
                        <tr key={flight.id}>
                          <td>
                            <strong className={styles.primaryValue}>{local(flight.scheduledDeparture)}</strong>
                            <small>{utc(flight.scheduledDeparture)} UTC</small>
                          </td>
                          <td>
                            <strong className={styles.primaryValue}>{flight.flightNumber}</strong>
                            <small>{flight.callsign}</small>
                          </td>
                          <td>
                            <strong className={styles.airportCode}>{flight.arrivalIcao}</strong>
                            <small>{flight.arrivalAirport?.city || flight.arrivalAirport?.name || "Destino"}</small>
                          </td>
                          <td>
                            <strong className={styles.primaryValue}>{local(flight.scheduledArrival)}</strong>
                            <small>{utc(flight.scheduledArrival)} UTC</small>
                          </td>
                          <td>{duration(flight.scheduledDurationMinutes)}</td>
                          <td>{flight.fleet?.code || "—"}</td>
                          <td>{flight.assignedAircraft?.registration || "A elegir"}</td>
                          <td>
                            <span className={`${styles.statusBadge} ${statusClass(flight.availability.state)}`}>
                              {labels[flight.availability.state]}
                            </span>
                          </td>
                          <td>{action(flight)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className={styles.emptyState}>
                  <strong>No hay salidas programadas</strong>
                  <span>No existen vuelos publicados para este día local.</span>
                </div>
              )}
            </div>
          </section>

          <section className={styles.upcomingSection}>
            <header className={styles.sectionHeader}>
              <div>
                <span className={styles.cardEyebrow}>SIGUIENTES DÍAS</span>
                <h2>Próximas salidas</h2>
              </div>
              <p>Solo se muestran vuelos posteriores al día seleccionado.</p>
            </header>

            {upcomingGroups.length ? (
              <div className={styles.upcomingGroups}>
                {upcomingGroups.map(([date, flights]) => (
                  <section className={styles.upcomingGroup} key={date}>
                    <h3>{dateLabel(date)}</h3>
                    <div className={styles.upcomingList}>
                      {flights.map((flight) => (
                        <article className={styles.upcomingFlight} key={flight.id}>
                          <div className={styles.upcomingTime}>
                            <strong>{local(flight.scheduledDeparture)}</strong>
                            <small>{utc(flight.scheduledDeparture)} UTC</small>
                          </div>
                          <div className={styles.upcomingIdentity}>
                            <strong>{flight.flightNumber}</strong>
                            <small>{flight.callsign}</small>
                          </div>
                          <div className={styles.upcomingRoute}>
                            <strong>
                              {airport.icao} <span>→</span> {flight.arrivalIcao}
                            </strong>
                            <small>{flight.arrivalAirport?.city || flight.arrivalAirport?.name || "Destino"}</small>
                          </div>
                          <div className={styles.upcomingAircraft}>
                            <strong>{flight.fleet?.code || "—"}</strong>
                            <small>{flight.assignedAircraft?.registration || "A elegir"}</small>
                          </div>
                          <span className={`${styles.statusBadge} ${statusClass(flight.availability.state)}`}>
                            {labels[flight.availability.state]}
                          </span>
                          <div className={styles.upcomingAction}>{action(flight)}</div>
                        </article>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className={styles.emptyState}>
                <strong>No hay próximas salidas</strong>
                <span>No existen más vuelos publicados desde {airport.icao} en el horizonte disponible.</span>
              </div>
            )}
          </section>
        </>
      )}
    </PilotPortalShell>
  );
}
