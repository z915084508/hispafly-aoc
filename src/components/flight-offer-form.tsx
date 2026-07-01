"use client";

import { useMemo, useState } from "react";
import { createFlightOfferAction, getRouteFleetIdsAction } from "@/app/staff/flight-offers/actions";
import type { FlightOfferRouteOption } from "@/lib/flightOffers/options";

interface AirportOption { icao: string; iata: string | null; name: string | null }
interface FleetOption { id: string; name: string | null; code: string | null; passengers: number | null; cargoKg: number | null }
interface AircraftOption { vamsysAircraftId: string; registration: string | null; aircraftType: string | null; fleetId: string | null; status: string | null }

export function FlightOfferForm({ airports, routes, fleets, aircraft }: {
  airports: AirportOption[];
  routes: FlightOfferRouteOption[];
  fleets: FleetOption[];
  aircraft: AircraftOption[];
}) {
  const [departure, setDeparture] = useState("");
  const [arrival, setArrival] = useState("");
  const [routeId, setRouteId] = useState("");
  const [fleetId, setFleetId] = useState("");
  const [aircraftId, setAircraftId] = useState("");
  const [flightNumber, setFlightNumber] = useState("");
  const [callsign, setCallsign] = useState("");
  const [aircraftType, setAircraftType] = useState("");
  const [registration, setRegistration] = useState("");
  const [passengers, setPassengers] = useState("");
  const [cargoKg, setCargoKg] = useState("");
  const [altitude, setAltitude] = useState("");
  const [userRoute, setUserRoute] = useState("");
  const [routeFleetIds, setRouteFleetIds] = useState<string[] | null>(null);
  const [routeFleetLoading, setRouteFleetLoading] = useState(false);
  const [routeFleetError, setRouteFleetError] = useState<string | null>(null);

  const filteredRoutes = useMemo(() => routes.filter((route) => (!departure || route.departure === departure.toUpperCase()) && (!arrival || route.arrival === arrival.toUpperCase())), [routes, departure, arrival]);
  const filteredFleets = routeId
    ? fleets.filter((fleet) => (routeFleetIds ?? []).includes(fleet.id))
    : [];
  const filteredAircraft = aircraft.filter((item) => !fleetId || item.fleetId === fleetId);

  async function loadRouteFleets(value: string, fallbackIds: string[] = []) {
    if (!/^\d+$/.test(value)) return;
    setRouteFleetLoading(true); setRouteFleetError(null); setRouteFleetIds([]);
    const result = await getRouteFleetIdsAction(value);
    const allowed = result.fleetIds.length ? result.fleetIds : fallbackIds;
    setRouteFleetIds(allowed);
    setRouteFleetError(result.error);
    setRouteFleetLoading(false);
    if (fleetId && !allowed.includes(fleetId)) selectFleet("");
  }

  function selectRoute(value: string) {
    setRouteId(value);
    const route = routes.find((item) => item.id === value);
    setFleetId(""); setAircraftId(""); setRegistration(""); setRouteFleetIds(null);
    if (!route) { void loadRouteFleets(value); return; }
    setDeparture(route.departure); setArrival(route.arrival);
    setFlightNumber(route.flightNumber ?? ""); setCallsign(route.callsign ?? "");
    setAltitude(route.altitude?.toString() ?? ""); setUserRoute(route.userRoute ?? "");
    void loadRouteFleets(value, route.fleetIds);
  }

  function selectFleet(value: string) {
    setFleetId(value); setAircraftId(""); setRegistration("");
    const fleet = fleets.find((item) => item.id === value);
    if (!fleet) return;
    setAircraftType(fleet.code ?? "");
    if (fleet.passengers !== null) setPassengers(String(fleet.passengers));
    if (fleet.cargoKg !== null) setCargoKg(String(fleet.cargoKg));
  }

  function selectAircraft(value: string) {
    setAircraftId(value);
    const item = aircraft.find((row) => row.vamsysAircraftId === value);
    if (!item) return;
    setFleetId(item.fleetId ?? fleetId); setAircraftType(item.aircraftType ?? aircraftType); setRegistration(item.registration ?? "");
  }

  return <form className="offer-form" action={createFlightOfferAction}>
    <label className="wide">Título<input name="title" required placeholder="LEMD-LEBL · A320 evening service" /></label>
    <label>Flight number<input name="flightNumber" value={flightNumber} onChange={(event) => setFlightNumber(event.target.value)} placeholder="HF123" /></label>
    <label>Callsign<input name="callsign" value={callsign} onChange={(event) => setCallsign(event.target.value)} placeholder="HPF123" /></label>
    <label>Salida ICAO<input list="offer-airports" name="departureIcao" value={departure} onChange={(event) => { setDeparture(event.target.value.toUpperCase()); setRouteId(""); }} required maxLength={4} /></label>
    <label>Llegada ICAO<input list="offer-airports" name="arrivalIcao" value={arrival} onChange={(event) => { setArrival(event.target.value.toUpperCase()); setRouteId(""); }} required maxLength={4} /></label>
    <datalist id="offer-airports">{airports.map((airport) => <option key={airport.icao} value={airport.icao}>{airport.iata ? `${airport.iata} · ` : ""}{airport.name}</option>)}</datalist>
    <label className="wide">航线 / Route<select value={routeId} onChange={(event) => selectRoute(event.target.value)}><option value="">选择航线（或手动输入 ID）</option>{filteredRoutes.map((route) => <option key={route.id} value={route.id}>{route.flightNumber ?? route.id} · {route.departure}-{route.arrival}</option>)}</select></label>
    <label>vAMSYS route_id<input name="vamsysRouteId" value={routeId} onChange={(event) => setRouteId(event.target.value)} onBlur={(event) => void loadRouteFleets(event.target.value)} required inputMode="numeric" /></label>
    <label>Fleet<select value={fleetId} onChange={(event) => selectFleet(event.target.value)} disabled={!routeId || routeFleetLoading}><option value="">{routeFleetLoading ? "Consultando vAMSYS…" : routeId ? "Seleccionar Fleet compatible" : "Seleccione primero una ruta"}</option>{filteredFleets.map((fleet) => <option key={fleet.id} value={fleet.id}>{fleet.code ?? fleet.name ?? fleet.id} · {fleet.name ?? fleet.id}</option>)}</select>{routeFleetError && <span className="field-note">{routeFleetError}</span>}</label>
    <label>vAMSYS fleet_id<input name="vamsysFleetId" value={fleetId} onChange={(event) => selectFleet(event.target.value)} inputMode="numeric" /></label>
    <label className="wide">Aircraft<select value={aircraftId} onChange={(event) => selectAircraft(event.target.value)}><option value="">选择 Aircraft（或手动输入 ID）</option>{filteredAircraft.map((item) => <option key={item.vamsysAircraftId} value={item.vamsysAircraftId}>{item.registration ?? item.vamsysAircraftId} · {item.aircraftType ?? "—"}{item.status ? ` · ${item.status}` : ""}</option>)}</select></label>
    <label>vAMSYS aircraft_id<input name="vamsysAircraftId" value={aircraftId} onChange={(event) => selectAircraft(event.target.value)} required inputMode="numeric" /></label>
    <label>Tipo aeronave<input name="aircraftType" value={aircraftType} onChange={(event) => setAircraftType(event.target.value.toUpperCase())} placeholder="A320" /></label>
    <label>Matrícula<input name="aircraftRegistration" value={registration} onChange={(event) => setRegistration(event.target.value.toUpperCase())} /></label>
    <label>Salida programada<input name="scheduledDeparture" type="datetime-local" required /></label>
    <label>Llegada programada<input name="scheduledArrival" type="datetime-local" /></label>
    <label>Válida hasta<input name="validUntil" type="datetime-local" required /></label>
    <label>Pasajeros<input name="passengers" value={passengers} onChange={(event) => setPassengers(event.target.value)} type="number" min="0" /></label>
    <label>Carga kg<input name="cargoKg" value={cargoKg} onChange={(event) => setCargoKg(event.target.value)} type="number" min="0" /></label>
    <label>Altitud<input name="altitude" value={altitude} onChange={(event) => setAltitude(event.target.value)} type="number" min="0" /></label>
    <label>Red<input name="network" placeholder="VATSIM" /></label>
    <label>Tipo recompensa<select name="rewardType"><option value="FIXED">Importe fijo</option><option value="PERCENTAGE">% de nómina</option></select></label>
    <label>Recompensa (€ o %)<input name="reward" type="number" min="0" step="0.01" defaultValue="0" /></label>
    <label className="wide">Ruta operacional<textarea name="userRoute" value={userRoute} onChange={(event) => setUserRoute(event.target.value)} /></label>
    <div><button className="button" type="submit">Crear borrador</button></div>
  </form>;
}
