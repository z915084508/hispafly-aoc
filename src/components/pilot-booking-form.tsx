"use client";

import { useMemo, useState } from "react";
import { createPilotBookingAction } from "@/app/pilot/bookings/actions";
import { getPilotRouteDetailsAction } from "@/app/pilot/bookings/actions";
import type { FlightOfferRouteOption } from "@/lib/flightOffers/options";

type FleetOption = { id: string; name: string | null; code: string | null; passengers: number | null; cargoKg: number | null };
type AircraftOption = { vamsysAircraftId: string; registration: string | null; aircraftType: string | null; fleetId: string | null; status: string | null };

const isoFromUtcInput = (value: string) => value ? new Date(`${value}:00Z`).toISOString() : "";
const utcInput = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}T${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
const utcDisplay = (date: Date) => new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(date) + " UTC";

export function PilotBookingForm({ routes, fleets, aircraft }: { routes: FlightOfferRouteOption[]; fleets: FleetOption[]; aircraft: AircraftOption[] }) {
  const airports = useMemo(() => [...new Set(routes.flatMap((route) => [route.departure, route.arrival]))].sort(), [routes]);
  const [departure, setDeparture] = useState("");
  const [arrival, setArrival] = useState("");
  const [routeId, setRouteId] = useState("");
  const [fleetId, setFleetId] = useState("");
  const [aircraftId, setAircraftId] = useState("");
  const [departureAt, setDepartureAt] = useState("");
  const [routeFleetIds, setRouteFleetIds] = useState<string[] | null>(null);
  const [durationMinutes, setDurationMinutes] = useState<number | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const route = routes.find((item) => item.id === routeId) ?? null;
  const routeChoices = routes.filter((item) => (!departure || item.departure === departure) && (!arrival || item.arrival === arrival));
  const compatibleFleetIds = routeFleetIds ?? route?.fleetIds ?? [];
  const fleetChoices = compatibleFleetIds.length ? fleets.filter((fleet) => compatibleFleetIds.includes(fleet.id)) : fleets;
  const aircraftChoices = aircraft.filter((item) => (!fleetId || item.fleetId === fleetId) && (!compatibleFleetIds.length || (item.fleetId && compatibleFleetIds.includes(item.fleetId))));
  const selectedAircraft = aircraft.find((item) => item.vamsysAircraftId === aircraftId) ?? null;
  const effectiveDuration = durationMinutes ?? route?.durationMinutes ?? null;
  const arrivalAt = effectiveDuration && departureAt ? new Date(new Date(isoFromUtcInput(departureAt)).getTime() + effectiveDuration * 60_000) : null;

  async function chooseRoute(value: string) {
    setRouteId(value); setFleetId(""); setAircraftId(""); setRouteFleetIds(null); setRouteError(null); setDurationMinutes(null);
    const selected = routes.find((item) => item.id === value);
    if (selected) { setDeparture(selected.departure); setArrival(selected.arrival); }
    if (!value) return;
    setRouteLoading(true);
    const details = await getPilotRouteDetailsAction(value);
    setRouteFleetIds(details.fleetIds); setDurationMinutes(details.durationMinutes); setRouteError(details.error); setRouteLoading(false);
  }

  return <form className="offer-form" action={createPilotBookingAction}>
    <input type="hidden" name="departureAt" value={isoFromUtcInput(departureAt)}/>
    <label>Salida ICAO<select value={departure} onChange={(event) => { setDeparture(event.target.value); setRouteId(""); setFleetId(""); setAircraftId(""); }} required><option value="">Seleccionar</option>{airports.map((icao) => <option key={icao}>{icao}</option>)}</select></label>
    <label>Llegada ICAO<select value={arrival} onChange={(event) => { setArrival(event.target.value); setRouteId(""); setFleetId(""); setAircraftId(""); }} required><option value="">Seleccionar</option>{airports.filter((icao) => icao !== departure).map((icao) => <option key={icao}>{icao}</option>)}</select></label>
    <label className="wide">Ruta vAMSYS<select name="routeId" value={routeId} onChange={(event) => void chooseRoute(event.target.value)} required><option value="">Seleccionar ruta</option>{routeChoices.map((item) => <option value={item.id} key={item.id}>{item.flightNumber ?? item.callsign ?? item.id} · {item.departure}-{item.arrival}</option>)}</select></label>
    <label>Fleet compatible<select name="fleetId" value={fleetId} onChange={(event) => { setFleetId(event.target.value); setAircraftId(""); }} disabled={!routeId || routeLoading} required><option value="">{routeLoading ? "Consultando vAMSYS…" : "Seleccionar Fleet"}</option>{fleetChoices.map((fleet) => <option value={fleet.id} key={fleet.id}>{fleet.name ?? fleet.code ?? fleet.id}</option>)}</select>{routeError && <span className="field-note">{routeError}</span>}</label>
    <label>Aircraft<select name="aircraftId" value={aircraftId} onChange={(event) => setAircraftId(event.target.value)} required><option value="">Seleccionar Aircraft</option>{aircraftChoices.map((item) => <option value={item.vamsysAircraftId} key={item.vamsysAircraftId}>{item.registration ?? item.vamsysAircraftId} · {item.aircraftType ?? "Tipo desconocido"}</option>)}</select></label>
    <label>Salida programada (UTC)<input type="datetime-local" value={departureAt} min={utcInput(new Date(Date.now() + 5 * 60_000))} onChange={(event) => setDepartureAt(event.target.value)} required/></label>
    <label>Llegada estimada (UTC)<input value={arrivalAt ? utcDisplay(arrivalAt) : "Se calcula con Route API"} readOnly/></label>
    <label>Flight number<input value={route?.flightNumber ?? ""} readOnly/></label>
    <label key={`callsign-${routeId}`}>Callsign<input name="callsign" defaultValue={route?.callsign ?? ""} maxLength={7}/></label>
    <label>Tipo de aeronave<input value={selectedAircraft?.aircraftType ?? ""} readOnly/></label>
    <label>Red<select name="network" defaultValue="vatsim"><option value="vatsim">VATSIM</option><option value="ivao">IVAO</option><option value="poscon">POSCON</option><option value="offline">Offline</option><option value="other">Other</option></select></label>
    <label key={`altitude-${routeId}`}>Altitud<input name="altitude" type="number" min="10" max="70000" defaultValue={route?.altitude ?? undefined}/></label>
    <label>Pasajeros<input name="passengers" type="number" min="0"/></label>
    <label>Carga kg<input name="cargoKg" type="number" min="0"/></label>
    <label className="wide" key={`user-route-${routeId}`}>Ruta operacional<textarea name="userRoute" defaultValue={route?.userRoute ?? ""}/></label>
    <div className="wide"><button className="button" type="submit" disabled={!routeId || !fleetId || !aircraftId || !departureAt}>Crear Booking en vAMSYS</button></div>
  </form>;
}
