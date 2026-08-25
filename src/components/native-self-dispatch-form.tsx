"use client";

import { useEffect, useMemo, useState } from "react";
import { createNativeSelfDispatchAction } from "@/app/pilot/flight-offers/self-dispatch/actions";
import { HISPAFLY_PAYLOAD_POLICY, passengerBaggageWeight } from "@/lib/payload/policy";

type RouteOption = { id: string; flightNumber: string | null; callsign: string | null; departure: string; arrival: string; departureAirportId: string; duration: number; fleetIds: string[]; altitude: number | null; userRoute: string | null };
type AircraftOption = { id: string; registration: string | null; aircraftType: string | null; airportId: string; airportIcao: string; fleetId: string; seatCapacity: number; source: string; updatedAt: string; stale: boolean; external: boolean };
type AmnAllocation = { payloadRequestId: string; marketSnapshotId: string; loadStage: string; passengers: number; cargoWeightKg: number; cargoVolumeM3: number; sellableSeats: number; maximumCargoWeightKg: number; maximumTrafficPayloadKg: number; estimatedTrafficPayloadKg: number; expiresAt: string };
const HOLD_STORAGE_KEY = "hispafly:amn-payload-hold:v1";

export function NativeSelfDispatchForm({ routes, aircraft, idempotencyKey, simbriefConnected, pilotAirportIcao }: { routes: RouteOption[]; aircraft: AircraftOption[]; idempotencyKey: string; simbriefConnected: boolean; pilotAirportIcao: string }) {
  const [departure] = useState(pilotAirportIcao);
  const [arrival, setArrival] = useState("");
  const [routeId, setRouteId] = useState("");
  const [aircraftId, setAircraftId] = useState("");
  const [departureAt, setDepartureAt] = useState("");
  const [amnAllocation, setAmnAllocation] = useState<AmnAllocation | null>(null);
  const [amnToken, setAmnToken] = useState("");
  const [amnError, setAmnError] = useState("");
  const [amnLoading, setAmnLoading] = useState(false);
  const [holdSeconds, setHoldSeconds] = useState(0);
  const [altitude, setAltitude] = useState("");
  const [userRoute, setUserRoute] = useState("");
  const route = routes.find((item) => item.id === routeId) ?? null;
  const aircraftAtDeparture = useMemo(() => aircraft.filter((item) => item.airportIcao === departure), [aircraft, departure]);
  const arrivalChoices = useMemo(() => [...new Set(routes.filter((item) => item.departure === departure).map((item) => item.arrival))].sort(), [departure, routes]);
  const routeChoices = routes.filter((item) => item.departure === departure && item.arrival === arrival);
  const compatibleAircraft = route ? aircraftAtDeparture.filter((item) => !route.fleetIds.length || route.fleetIds.includes(item.fleetId)) : [];
  const selectedAircraft = aircraft.find((item) => item.id === aircraftId) ?? null;
  const passengers = amnAllocation?.passengers ?? 0;
  const loadFactor = selectedAircraft && passengers ? Math.round(passengers / selectedAircraft.seatCapacity * 1000) / 10 : 0;
  const baggagePerPassenger = HISPAFLY_PAYLOAD_POLICY.baggageKgPerPassenger;
  const luggageKg = passengerBaggageWeight(passengers, baggagePerPassenger);
  const freightKg = amnAllocation?.cargoWeightKg ?? 0;
  const totalCargoKg = luggageKg + freightKg;
  const arrivalAt = route && departureAt ? new Date(new Date(`${departureAt}:00Z`).getTime() + route.duration * 60_000) : null;
  const locked = Boolean(amnAllocation && amnToken && holdSeconds > 0);

  useEffect(() => {
    try {
      const stored = JSON.parse(sessionStorage.getItem(HOLD_STORAGE_KEY) ?? "null") as { allocation: AmnAllocation; token: string; routeId: string; aircraftId: string; departureAt: string; arrival: string } | null;
      if (!stored || Date.parse(stored.allocation.expiresAt) <= Date.now()) { sessionStorage.removeItem(HOLD_STORAGE_KEY); return; }
      setAmnAllocation(stored.allocation); setAmnToken(stored.token); setRouteId(stored.routeId); setAircraftId(stored.aircraftId); setDepartureAt(stored.departureAt); setArrival(stored.arrival);
    } catch { sessionStorage.removeItem(HOLD_STORAGE_KEY); }
  }, []);

  useEffect(() => {
    if (!amnAllocation) { setHoldSeconds(0); return; }
    const update = () => {
      const remaining = Math.max(0, Math.ceil((Date.parse(amnAllocation.expiresAt) - Date.now()) / 1000));
      setHoldSeconds(remaining);
      if (!remaining) { setAmnAllocation(null); setAmnToken(""); sessionStorage.removeItem(HOLD_STORAGE_KEY); }
    };
    update(); const timer = window.setInterval(update, 1000); return () => window.clearInterval(timer);
  }, [amnAllocation]);

  function applyRoute(nextRoute: RouteOption | null) {
    setRouteId(nextRoute?.id ?? ""); setAircraftId(""); setAltitude(nextRoute?.altitude ? String(nextRoute.altitude) : ""); setUserRoute(nextRoute?.userRoute ?? ""); clearAmnAllocation();
  }
  function chooseArrival(value: string) {
    setArrival(value); const matches = routes.filter((item) => item.departure === departure && item.arrival === value); applyRoute(matches.length === 1 ? matches[0] : null);
  }

  function clearAmnAllocation() { setAmnAllocation(null); setAmnToken(""); setAmnError(""); sessionStorage.removeItem(HOLD_STORAGE_KEY); }

  async function generateAmnPayload() {
    if (!routeId || !aircraftId || !departureAt || locked) return;
    setAmnLoading(true); setAmnError(""); setAmnAllocation(null); setAmnToken("");
    try {
      const response = await fetch("/api/amn/payload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ routeId, aircraftId, departureAt: `${departureAt}:00Z`, idempotencyKey }) });
      const body = await response.json() as { allocation?: AmnAllocation; token?: string; error?: string };
      if (!response.ok || !body.allocation || !body.token) throw new Error(body.error || "AMN Payload request failed.");
      setAmnAllocation(body.allocation); setAmnToken(body.token);
      sessionStorage.setItem(HOLD_STORAGE_KEY, JSON.stringify({ allocation: body.allocation, token: body.token, routeId, aircraftId, departureAt, arrival }));
    } catch (error) { setAmnError(error instanceof Error ? error.message : "AMN Payload request failed."); }
    finally { setAmnLoading(false); }
  }

  return <form className="pilot-booking-form native-self-dispatch" action={createNativeSelfDispatchAction}>
    <input type="hidden" name="idempotencyKey" value={idempotencyKey}/>
    <fieldset><legend><span>01</span> Route and aircraft</legend><div className="pilot-booking-grid">
      <label>Departure airport<input value={departure} readOnly aria-readonly="true"/><span className="meta">Automatically matched to your crew position.</span></label>
      <label>Available arrival airport<select value={arrival} onChange={(event) => chooseArrival(event.target.value)} disabled={!departure || locked} required><option value="">{departure ? "Select destination" : "Select departure first"}</option>{arrivalChoices.map((icao) => <option key={icao}>{icao}</option>)}</select></label>
      <label>Matched route{locked && <input type="hidden" name="routeId" value={routeId}/>}<select name={locked ? undefined : "routeId"} value={routeId} onChange={(event) => applyRoute(routes.find((item) => item.id === event.target.value) ?? null)} disabled={!arrival || locked} required><option value="">{routeChoices.length === 1 ? "Route matched automatically" : "Select matching route"}</option>{routeChoices.map((item) => <option value={item.id} key={item.id}>{item.flightNumber ?? "Route"} · {item.departure} → {item.arrival} · {item.duration} min</option>)}</select></label>
      <label>Available aircraft{locked && <input type="hidden" name="aircraftId" value={aircraftId}/>}<select name={locked ? undefined : "aircraftId"} value={aircraftId} onChange={(event) => { setAircraftId(event.target.value); clearAmnAllocation(); }} disabled={!route || locked} required><option value="">{route ? compatibleAircraft.length ? "Select aircraft" : `No compatible aircraft at ${departure}` : "Match route first"}</option>{compatibleAircraft.map((item) => <option value={item.id} key={item.id}>{item.registration ?? item.id} · {item.aircraftType ?? "Type pending"} · {item.seatCapacity} seats{item.stale ? " · stale position" : ""}{item.external ? " · external source" : ""}</option>)}</select></label>
    </div></fieldset>
    {selectedAircraft && (selectedAircraft.stale || selectedAircraft.external) && <div className="notice"><strong>Aircraft position requires confirmation.</strong><p>{selectedAircraft.registration} is shown at {selectedAircraft.airportIcao}, but the position is {selectedAircraft.stale ? "older than 72 hours" : "not stale"}{selectedAircraft.external ? " and came from an external vAMSYS movement" : ""}. Last updated {new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(selectedAircraft.updatedAt))} UTC.</p><label><input type="checkbox" name="acknowledgeLocationWarning" value="yes" required/> I confirm this aircraft is currently available at {selectedAircraft.airportIcao}.</label></div>}
    <fieldset><legend><span>02</span> Schedule</legend><div className="pilot-booking-grid">
      <label className="span-2">Departure date and time (UTC){locked && <input type="hidden" name="departureAt" value={departureAt}/>}<input type="datetime-local" name={locked ? undefined : "departureAt"} value={departureAt} onChange={(event) => { setDepartureAt(event.target.value); clearAmnAllocation(); }} disabled={locked} required/></label>
      <label className="span-2">Calculated arrival (UTC)<input value={arrivalAt && !Number.isNaN(arrivalAt.getTime()) ? `${arrivalAt.toISOString().slice(0, 16).replace("T", " ")} UTC` : "Calculated from route duration"} readOnly/></label>
    </div></fieldset>
    <fieldset><legend><span>03</span> AMN Payload and flight plan</legend>
      <input type="hidden" name="amnPayloadToken" value={amnToken}/>
      <div className="button-row"><button className="button secondary" type="button" onClick={generateAmnPayload} disabled={!routeId || !aircraftId || !departureAt || amnLoading || locked}>{amnLoading ? "Requesting AMN traffic…" : locked ? `AMN Payload Locked · ${String(Math.floor(holdSeconds / 60)).padStart(2, "0")}:${String(holdSeconds % 60).padStart(2, "0")}` : "Auto Generate Payload"}</button><span className="meta">A hold is not a Booking or Dispatch. Route, aircraft and time remain locked until OFP preparation confirms it or the timer expires.</span></div>
      {amnError && <div className="feedback error"><strong>AMN did not allocate Payload.</strong><br/>{amnError}</div>}
      {amnAllocation && <div className="feedback success"><strong>AMN Payload allocated</strong> · {amnAllocation.loadStage} · Request {amnAllocation.payloadRequestId}<br/>Market snapshot {amnAllocation.marketSnapshotId}</div>}
      <div className="pilot-booking-grid">
      <label>Load factor %<input value={amnAllocation ? loadFactor : ""} readOnly placeholder="Generated by AMN"/></label>
      <label>Passengers<input value={passengers || ""} readOnly/></label>
      <label>Baggage per passenger kg<input value={amnAllocation ? baggagePerPassenger : ""} readOnly/><span className="meta">HISPAFLY policy · AMN does not set passenger baggage.</span></label>
      <label>Passenger luggage kg<input value={luggageKg || ""} readOnly/></label>
      <label>Commercial freight kg<input value={amnAllocation ? freightKg : ""} readOnly/></label>
      <label>Total cargo kg<input value={totalCargoKg || ""} readOnly/></label>
      <label>Cruise altitude ft<input name="altitude" type="number" min="1000" max="70000" step="100" value={altitude} onChange={(event) => setAltitude(event.target.value)}/></label>
      <label>Network<select name="network" defaultValue="vatsim"><option value="vatsim">VATSIM</option><option value="ivao">IVAO</option><option value="poscon">POSCON</option><option value="offline">Offline</option></select></label>
      <label className="span-2">Callsign<input value={route?.callsign ?? route?.flightNumber ?? ""} readOnly/></label>
      <label className="span-2">Operational route<textarea name="userRoute" value={userRoute} onChange={(event) => setUserRoute(event.target.value)} placeholder="Leave blank to let SimBrief calculate the route"/></label>
    </div></fieldset>
    {!simbriefConnected && <div className="notice"><strong>Connect Navigraph / SimBrief before continuing.</strong> The booking workflow will use the existing SimBrief API to generate, store and sign the OFP. <a href="/api/auth/navigraph/start">Connect now</a></div>}
    <div className="pilot-booking-submit"><div><strong>{amnAllocation ? "AMN Payload ready for SimBrief" : "AMN Payload required"}</strong><span>Creates the Flight, Booking and Dispatch using the immutable AMN allocation, then opens the SimBrief OFP workflow.</span></div><button className="button" disabled={!departure || !arrival || !routeId || !aircraftId || !departureAt || !simbriefConnected || !amnToken}>Prepare SimBrief OFP</button></div>
  </form>;
}
