"use client";

import { useMemo, useState } from "react";
import { createNativeSelfDispatchAction } from "@/app/pilot/flight-offers/self-dispatch/actions";

type RouteOption = { id: string; flightNumber: string | null; departure: string; arrival: string; departureAirportId: string; duration: number; fleetIds: string[] };
type AircraftOption = { id: string; registration: string | null; aircraftType: string | null; airportId: string; airportIcao: string; fleetId: string };

export function NativeSelfDispatchForm({ routes, aircraft, idempotencyKey }: { routes: RouteOption[]; aircraft: AircraftOption[]; idempotencyKey: string }) {
  const [routeId, setRouteId] = useState("");
  const [aircraftId, setAircraftId] = useState("");
  const route = routes.find((item) => item.id === routeId) ?? null;
  const compatibleAircraft = useMemo(() => route ? aircraft.filter((item) => item.airportId === route.departureAirportId && (!route.fleetIds.length || route.fleetIds.includes(item.fleetId))) : [], [aircraft, route]);
  return <form className="pilot-booking-form native-self-dispatch" action={createNativeSelfDispatchAction}>
    <input type="hidden" name="idempotencyKey" value={idempotencyKey}/>
    <fieldset><legend><span>01</span> Choose operation</legend><div className="pilot-booking-grid">
      <label className="span-2">Route<select name="routeId" value={routeId} onChange={(event) => { setRouteId(event.target.value); setAircraftId(""); }} required><option value="">Select an active route</option>{routes.map((item) => <option value={item.id} key={item.id}>{item.flightNumber ?? "Route"} · {item.departure} → {item.arrival} · {item.duration} min</option>)}</select></label>
      <label className="span-2">Aircraft<select name="aircraftId" value={aircraftId} onChange={(event) => setAircraftId(event.target.value)} disabled={!route} required><option value="">{route ? compatibleAircraft.length ? "Select an available aircraft" : `No compatible aircraft at ${route.departure}` : "Select a route first"}</option>{compatibleAircraft.map((item) => <option value={item.id} key={item.id}>{item.registration ?? item.id} · {item.aircraftType ?? "Type pending"} · at {item.airportIcao}</option>)}</select></label>
    </div></fieldset>
    <fieldset><legend><span>02</span> Choose departure</legend><div className="pilot-booking-grid">
      <label className="span-2">Departure date and time (UTC)<input type="datetime-local" name="departureAt" required/></label>
      <div className="booking-time-note span-2"><strong>UTC time</strong><br/>The operation must start at least 15 minutes from now and no more than 30 days ahead. Arrival is calculated from the selected route.</div>
    </div></fieldset>
    <div className="pilot-booking-submit"><div><strong>Create my HispaFly operation</strong><span>This creates a concrete Flight and your Booking. Dispatch, OFP and ACARS remain separate controlled steps.</span></div><button className="button" disabled={!routeId || !aircraftId}>Create booking</button></div>
  </form>;
}
