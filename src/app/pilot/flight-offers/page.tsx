import Link from "next/link";
import { PageHeading } from "@/components/page-heading";
import { PilotPortalShell } from "@/components/pilot-portal-shell";
import { requirePilotSession } from "@/lib/pilot/session";
import { loadPilotDepartures } from "@/lib/native-flight/departures-service";

export const dynamic = "force-dynamic";
const labels = { AVAILABLE: "DISPONIBLE", MY_BOOKING: "TU RESERVA", RESERVED: "RESERVADO", UPCOMING: "PRÓXIMAMENTE", CLOSED: "CERRADO", CANCELLED: "CANCELADO", FINISHED: "FINALIZADO", WRONG_AIRPORT: "POSICIÓN REQUERIDA" } as const;
const duration = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

export default async function PilotFlightOffersPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const [session, query] = await Promise.all([requirePilotSession(), searchParams]);
  const result = await loadPilotDepartures(session.id, query.date);
  const airport = result.pilot.currentAirport;
  const utc = (date: Date) => new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" }).format(date);
  const local = (date: Date) => new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: result.day.timeZone }).format(date);
  const row = (flight: (typeof result.flights)[number], compact = false) => <tr key={flight.id}><td><strong>{local(flight.scheduledDeparture)}</strong><small>{utc(flight.scheduledDeparture)} UTC</small></td><td><strong>{flight.flightNumber}</strong><small>{flight.callsign}</small></td><td>{flight.arrivalIcao}<small>{flight.arrivalAirport?.city || flight.arrivalAirport?.name}</small></td><td>{local(flight.scheduledArrival)}<small>{utc(flight.scheduledArrival)} UTC</small></td>{!compact && <><td>{duration(flight.scheduledDurationMinutes)}</td><td>{flight.fleet?.code || "—"}</td><td>{flight.assignedAircraft?.registration || "A elegir"}</td></>}<td><strong>{labels[flight.availability.state]}</strong></td><td>{flight.availability.state === "MY_BOOKING" ? <Link className="action-button approve" href={`/pilot/bookings/${flight.availability.bookingId}`}>ABRIR MI RESERVA</Link> : flight.availability.state === "AVAILABLE" ? <Link className="action-button approve" href={`/pilot/flight-offers/${flight.id}`}>REVISAR Y RESERVAR</Link> : <Link href={`/pilot/flight-offers/${flight.id}`}>Ver vuelo</Link>}</td></tr>;
  return <PilotPortalShell>
    <div className="booking-page-header"><PageHeading eyebrow="PORTAL DE OPERACIONES" title="SELF DISPATCH" copy="Vuelos programados desde tu posición actual"/><Link className="button" href="/pilot/flight-offers/self-dispatch">+ CREATE MY FLIGHT</Link></div>
    <div className="dashboard-grid"><section className="card"><h2>VUELOS PROGRAMADOS</h2><p>Consulta la programación publicada desde tu aeropuerto actual y acepta un vuelo disponible.</p><strong>{airport ? `VER SALIDAS DESDE ${airport.icao}` : "POSICIÓN PENDIENTE"}</strong></section><section className="card"><h2>CREATE MY FLIGHT</h2><p>Elige libremente una ruta, una aeronave disponible y tu propia hora de salida.</p><Link className="button secondary" href="/pilot/flight-offers/self-dispatch">PLAN MY OWN OPERATION</Link></section></div>
    {!airport ? <section className="card"><h2>Posición de tripulación requerida</h2><p>Debes establecer tu posición de tripulación antes de reservar o crear una operación.</p><Link className="button" href="/pilot/flight-offers/self-dispatch">Establecer posición inicial</Link></section> : <>
      <section className="card"><div className="workflow-summary"><div><span>POSICIÓN DE TRIPULACIÓN</span><strong>{airport.icao} · {airport.city || airport.name}</strong></div><div><span>Actualizada</span><strong>{result.pilot.positionUpdatedAt?.toISOString().slice(0, 16).replace("T", " · ") || "Sin fecha"} UTC</strong></div><div><span>Origen</span><strong>{result.pilot.positionSource || "Operaciones"}</strong></div></div><p><Link href="/pilot/flight-offers/self-dispatch">Acceso Jumpseat</Link> · <Link href={`/pilot/routes?airport=${airport.icao}`}>Mapa de rutas</Link></p></section>
      {result.day.fallback && <div className="notice">La zona horaria del aeropuerto no es válida. Las fechas se muestran y consultan en UTC.</div>}
      <div className="booking-page-header"><h2>SALIDAS DESDE {airport.icao} · {result.day.date}</h2><div><Link className="button secondary" href={`?date=${result.day.previous}`}>← DÍA ANTERIOR</Link> <Link className="button secondary" href="/pilot/flight-offers">HOY</Link> <Link className="button secondary" href={`?date=${result.day.next}`}>DÍA SIGUIENTE →</Link></div></div>
      <section className="card"><div className="table-wrap departures-table"><table><thead><tr><th>HORA</th><th>VUELO</th><th>DESTINO</th><th>LLEGADA</th><th>DURACIÓN</th><th>FLOTA</th><th>AERONAVE</th><th>ESTADO</th><th>ACCIÓN</th></tr></thead><tbody>{result.flights.map((flight) => row(flight))}</tbody></table></div>{!result.flights.length && <p>No hay salidas programadas para este día local.</p>}</section>
      <section className="card"><h2>PRÓXIMAS SALIDAS</h2><div className="table-wrap"><table><tbody>{result.upcoming.map((flight) => row(flight, true))}</tbody></table></div></section>
    </>}
  </PilotPortalShell>;
}
