import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PilotPortalShell } from "@/components/pilot-portal-shell";
import { PageHeading } from "@/components/page-heading";
import { requirePilotSession } from "@/lib/pilot/session";
import { prisma } from "@/lib/prisma";
import { checkPilotEligibility } from "@/lib/native-flight/booking";
import { checkAircraftAvailability } from "@/lib/native-flight/availability";
import { ACTIVE_SCHEDULED_BOOKING_STATUSES, deriveDepartureAvailability } from "@/lib/native-flight/departures";
import { bookNativeFlightAction } from "../actions";

export default async function FlightBookingDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const [{ id }, query, pilot] = await Promise.all([params, searchParams, requirePilotSession()]);
  const [flight, position] = await Promise.all([
    prisma.flight.findUnique({ where: { id }, include: { route: true, fleet: true, schedule: true, arrivalAirport: true, assignedAircraft: { include: { currentAirport: true, conditionSnapshot: true } }, bookings: { where: { status: { in: [...ACTIVE_SCHEDULED_BOOKING_STATUSES] } }, select: { id: true, pilotId: true } } } }),
    prisma.pilot.findUnique({ where: { id: pilot.id }, include: { currentAirport: true } }),
  ]);
  if (!flight || flight.operatingType !== "SCHEDULED" || !flight.scheduleId) notFound();
  const eligibility = await checkPilotEligibility(pilot.id, flight, prisma, { allowExistingActiveDispatch: true });
  const availability = deriveDepartureAvailability({ ...flight, pilotId: pilot.id, currentAirportId: position?.currentAirportId ?? null, activeBookings: flight.bookings });
  const candidates = flight.assignedAircraftId ? [] : await prisma.aircraft.findMany({ where: { operationalStatus: "AVAILABLE", archivedAt: null, ...(flight.fleetId ? { nativeFleetId: flight.fleetId } : {}), currentAirportId: flight.departureAirportId ?? undefined }, include: { currentAirport: true }, orderBy: { registration: "asc" }, take: 100 });
  const checks = await Promise.all(candidates.map(async (item) => ({ item, check: await checkAircraftAvailability({ aircraftId: item.id, routeId: flight.routeId, departureAirportId: flight.departureAirportId, startsAt: flight.scheduledDeparture, endsAt: flight.scheduledArrival }) })));
  const availableAircraft = checks.filter(({ check }) => check.allowed).map(({ item }) => item);
  return <PilotPortalShell><PageHeading eyebrow="PROGRAMACIÓN PUBLICADA" title={`${flight.flightNumber} · ${flight.departureIcao} → ${flight.arrivalIcao}`} copy="Revisa el vuelo programado antes de reservarlo."/>
    {query.error && <div className="feedback error">{query.error}</div>}
    <section className="card"><div className="workflow-summary">
      <div><span>Fecha / programa</span><strong>{flight.operatingDate.toISOString().slice(0, 10)} · {flight.schedule?.code}</strong></div><div><span>Horario local</span><strong>{flight.departureLocalTime} {flight.departureTimezone} → {flight.arrivalLocalTime} {flight.arrivalTimezone}</strong></div><div><span>Horario UTC</span><strong>{flight.scheduledDeparture.toISOString()} → {flight.scheduledArrival.toISOString()}</strong></div><div><span>Ruta / destino</span><strong>{flight.route.routeCode || `${flight.departureIcao}-${flight.arrivalIcao}`} · {flight.arrivalAirport?.city || flight.arrivalAirport?.name}</strong></div><div><span>Duración / flota</span><strong>{flight.scheduledDurationMinutes} min · {flight.fleet?.code ?? "—"}</strong></div><div><span>{flight.assignedAircraft ? "AERONAVE ASIGNADA" : "AERONAVE A ELEGIR"}</span><strong>{flight.assignedAircraft ? `${flight.assignedAircraft.registration} · ${flight.assignedAircraft.aircraftType}` : "Selección compatible requerida"}</strong></div><div><span>Posición del piloto</span><strong>{position?.currentAirport?.icao ?? "Sin posición"}</strong></div><div><span>Disponibilidad</span><strong>{availability.state.replaceAll("_", " ")}</strong></div><div><span>Cierre</span><strong>{flight.bookingCloseAt?.toISOString() ?? "En la salida"}</strong></div>
    </div>
    {eligibility.blockingReasons.map((reason) => <div className="feedback error" key={reason}>{reason}</div>)}{eligibility.warnings.map((warning) => <div className="notice" key={warning}>{warning}</div>)}
    {availability.state === "MY_BOOKING" ? <Link className="button" href="/pilot/roster">VER EN MI CALENDARIO</Link> : <form action={bookNativeFlightAction}><input type="hidden" name="flightId" value={flight.id}/><input type="hidden" name="idempotencyKey" value={randomUUID()}/>{!flight.assignedAircraftId && <label>Aeronave<select name="aircraftId" required><option value="">Selecciona una aeronave</option>{availableAircraft.map((item) => <option key={item.id} value={item.id}>{item.registration} · {item.currentAirport?.icao}</option>)}</select></label>}<p className="meta">Esta acción solo reserva el vuelo y lo añade a tu calendario. No crea Dispatch ni OFP.</p><button className="button" disabled={!eligibility.allowed || availability.state !== "AVAILABLE"}>RESERVAR VUELO PROGRAMADO</button></form>}
    </section></PilotPortalShell>;
}
