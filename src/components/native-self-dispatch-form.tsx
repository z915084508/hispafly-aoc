"use client";

import { useMemo, useState } from "react";
import { createNativeSelfDispatchAction } from "@/app/pilot/flight-offers/self-dispatch/actions";

type RouteOption = { id: string; flightNumber: string | null; callsign: string | null; departure: string; arrival: string; departureAirportId: string; duration: number; fleetIds: string[]; altitude: number | null; userRoute: string | null };
type AircraftOption = { id: string; registration: string | null; aircraftType: string | null; airportId: string; airportIcao: string; fleetId: string; seatCapacity: number; source: string; updatedAt: string; stale: boolean; external: boolean };

export function NativeSelfDispatchForm({ routes, aircraft, idempotencyKey, simbriefConnected }: { routes: RouteOption[]; aircraft: AircraftOption[]; idempotencyKey: string; simbriefConnected: boolean }) {
  const [departure, setDeparture] = useState("");
  const [arrival, setArrival] = useState("");
  const [routeId, setRouteId] = useState("");
  const [aircraftId, setAircraftId] = useState("");
  const [departureAt, setDepartureAt] = useState("");
  const [loadFactor, setLoadFactor] = useState(80);
  const [baggagePerPassenger, setBaggagePerPassenger] = useState(23);
  const [freightKg, setFreightKg] = useState(0);
  const [altitude, setAltitude] = useState("");
  const [userRoute, setUserRoute] = useState("");
  const route = routes.find((item) => item.id === routeId) ?? null;
  const aircraftAtDeparture = useMemo(() => aircraft.filter((item) => item.airportIcao === departure), [aircraft, departure]);
  const departureChoices = useMemo(() => [...new Set(aircraft.map((item) => item.airportIcao).filter((icao) => routes.some((routeItem) => routeItem.departure === icao && (!routeItem.fleetIds.length || aircraft.some((plane) => plane.airportIcao === icao && routeItem.fleetIds.includes(plane.fleetId))))))].sort(), [aircraft, routes]);
  const arrivalChoices = useMemo(() => [...new Set(routes.filter((item) => item.departure === departure && aircraftAtDeparture.some((plane) => !item.fleetIds.length || item.fleetIds.includes(plane.fleetId))).map((item) => item.arrival))].sort(), [aircraftAtDeparture, departure, routes]);
  const routeChoices = routes.filter((item) => item.departure === departure && item.arrival === arrival && aircraftAtDeparture.some((plane) => !item.fleetIds.length || item.fleetIds.includes(plane.fleetId)));
  const compatibleAircraft = route ? aircraftAtDeparture.filter((item) => !route.fleetIds.length || route.fleetIds.includes(item.fleetId)) : [];
  const selectedAircraft = aircraft.find((item) => item.id === aircraftId) ?? null;
  const passengers = selectedAircraft ? Math.max(1, Math.min(selectedAircraft.seatCapacity, Math.round(selectedAircraft.seatCapacity * loadFactor / 100))) : 0;
  const luggageKg = Math.round(passengers * baggagePerPassenger);
  const totalCargoKg = luggageKg + freightKg;
  const arrivalAt = route && departureAt ? new Date(new Date(`${departureAt}:00Z`).getTime() + route.duration * 60_000) : null;

  function chooseDeparture(value: string) {
    setDeparture(value); setArrival(""); setRouteId(""); setAircraftId(""); setAltitude(""); setUserRoute("");
  }
  function applyRoute(nextRoute: RouteOption | null) {
    setRouteId(nextRoute?.id ?? ""); setAircraftId(""); setAltitude(nextRoute?.altitude ? String(nextRoute.altitude) : ""); setUserRoute(nextRoute?.userRoute ?? "");
  }
  function chooseArrival(value: string) {
    setArrival(value); const matches = routes.filter((item) => item.departure === departure && item.arrival === value && aircraftAtDeparture.some((plane) => !item.fleetIds.length || item.fleetIds.includes(plane.fleetId))); applyRoute(matches.length === 1 ? matches[0] : null);
  }

  return <form className="pilot-booking-form native-self-dispatch" action={createNativeSelfDispatchAction}>
    <input type="hidden" name="idempotencyKey" value={idempotencyKey}/>
    <fieldset><legend><span>01</span> Route and aircraft</legend><div className="pilot-booking-grid">
      <label>Departure airport<select value={departure} onChange={(event) => chooseDeparture(event.target.value)} required><option value="">Select aircraft location</option>{departureChoices.map((icao) => <option key={icao}>{icao}</option>)}</select></label>
      <label>Available arrival airport<select value={arrival} onChange={(event) => chooseArrival(event.target.value)} disabled={!departure} required><option value="">{departure ? "Select destination" : "Select departure first"}</option>{arrivalChoices.map((icao) => <option key={icao}>{icao}</option>)}</select></label>
      <label>Matched route<select name="routeId" value={routeId} onChange={(event) => applyRoute(routes.find((item) => item.id === event.target.value) ?? null)} disabled={!arrival} required><option value="">{routeChoices.length === 1 ? "Route matched automatically" : "Select matching route"}</option>{routeChoices.map((item) => <option value={item.id} key={item.id}>{item.flightNumber ?? "Route"} · {item.departure} → {item.arrival} · {item.duration} min</option>)}</select></label>
      <label>Available aircraft<select name="aircraftId" value={aircraftId} onChange={(event) => setAircraftId(event.target.value)} disabled={!route} required><option value="">{route ? compatibleAircraft.length ? "Select aircraft" : `No compatible aircraft at ${departure}` : "Match route first"}</option>{compatibleAircraft.map((item) => <option value={item.id} key={item.id}>{item.registration ?? item.id} · {item.aircraftType ?? "Type pending"} · {item.seatCapacity} seats{item.stale ? " · stale position" : ""}{item.external ? " · external source" : ""}</option>)}</select></label>
    </div></fieldset>
    {selectedAircraft && (selectedAircraft.stale || selectedAircraft.external) && <div className="notice"><strong>Aircraft position requires confirmation.</strong><p>{selectedAircraft.registration} is shown at {selectedAircraft.airportIcao}, but the position is {selectedAircraft.stale ? "older than 72 hours" : "not stale"}{selectedAircraft.external ? " and came from an external vAMSYS movement" : ""}. Last updated {new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(selectedAircraft.updatedAt))} UTC.</p><label><input type="checkbox" name="acknowledgeLocationWarning" value="yes" required/> I confirm this aircraft is currently available at {selectedAircraft.airportIcao}.</label></div>}
    <fieldset><legend><span>02</span> Schedule</legend><div className="pilot-booking-grid">
      <label className="span-2">Departure date and time (UTC)<input type="datetime-local" name="departureAt" value={departureAt} onChange={(event) => setDepartureAt(event.target.value)} required/></label>
      <label className="span-2">Calculated arrival (UTC)<input value={arrivalAt && !Number.isNaN(arrivalAt.getTime()) ? `${arrivalAt.toISOString().slice(0, 16).replace("T", " ")} UTC` : "Calculated from route duration"} readOnly/></label>
    </div></fieldset>
    <fieldset><legend><span>03</span> Payload and flight plan</legend><div className="pilot-booking-grid">
      <label>Load factor %<input name="loadFactorPercent" type="number" min="25" max="100" step="1" value={loadFactor} onChange={(event) => setLoadFactor(Number(event.target.value))} required/></label>
      <label>Passengers<input value={passengers || ""} readOnly/></label>
      <label>Baggage per passenger kg<input name="baggageKgPerPassenger" type="number" min="0" max="100" step="0.1" value={baggagePerPassenger} onChange={(event) => setBaggagePerPassenger(Number(event.target.value))} required/></label>
      <label>Passenger luggage kg<input value={luggageKg || ""} readOnly/></label>
      <label>Commercial freight kg<input name="freightKg" type="number" min="0" step="1" value={freightKg} onChange={(event) => setFreightKg(Math.max(0, Number(event.target.value)))} required/></label>
      <label>Total cargo kg<input value={totalCargoKg || ""} readOnly/></label>
      <label>Cruise altitude ft<input name="altitude" type="number" min="1000" max="70000" step="100" value={altitude} onChange={(event) => setAltitude(event.target.value)}/></label>
      <label>Network<select name="network" defaultValue="vatsim"><option value="vatsim">VATSIM</option><option value="ivao">IVAO</option><option value="poscon">POSCON</option><option value="offline">Offline</option></select></label>
      <label className="span-2">Callsign<input value={route?.callsign ?? route?.flightNumber ?? ""} readOnly/></label>
      <label className="span-2">Operational route<textarea name="userRoute" value={userRoute} onChange={(event) => setUserRoute(event.target.value)} placeholder="Leave blank to let SimBrief calculate the route"/></label>
    </div></fieldset>
    {!simbriefConnected && <div className="notice"><strong>Connect Navigraph / SimBrief before continuing.</strong> The booking workflow will use the existing SimBrief API to generate, store and sign the OFP. <a href="/api/auth/navigraph/start">Connect now</a></div>}
    <div className="pilot-booking-submit"><div><strong>Ready for SimBrief planning</strong><span>Creates the Flight, Booking and Dispatch, then opens the existing SimBrief OFP workflow.</span></div><button className="button" disabled={!departure || !arrival || !routeId || !aircraftId || !departureAt || !simbriefConnected}>Prepare SimBrief OFP</button></div>
  </form>;
}
