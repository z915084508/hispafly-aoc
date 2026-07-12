"use client";
import { useState, useTransition } from "react";
import { SubmitButton } from "@/components/submit-button";
import { suggestRouteIdentityAction } from "@/app/staff/routes/actions";
import { arrivalTimeUtc,estimatedRouteMinutes,greatCircleDistanceNm } from "@/lib/vamsys/routes/planning";

type Airport = { icao: string; name: string | null; latitude?: number | null; longitude?: number | null };
type Fleet = { id: string; vamsysFleetId: string | null; name: string | null };
type RouteValue = { id?: string; type?: string; callsign?: string | null; flightNumber?: string | null; departure?: string; arrival?: string; route?: string | null; scheduledDurationMinutes?: number | null; distanceNm?: number | null; cruiseAltitude?: number | null; costIndex?: number | null; operationalStatus?: string; internalNotes?: string | null; fleetAssignments?: { fleetId: string }[] };

export function RouteForm({ action, airports, fleets, value }: { action: (formData: FormData) => void | Promise<void>; airports: Airport[]; fleets: Fleet[]; value?: RouteValue }) {
  const selected = new Set(value?.fleetAssignments?.map(item => item.fleetId));
  const [flightNumber,setFlightNumber]=useState(value?.flightNumber??"");
  const [callsign,setCallsign]=useState(value?.callsign??"");
  const [departure,setDeparture]=useState(value?.departure??"");
  const [arrival,setArrival]=useState(value?.arrival??"");
  const [departureTime,setDepartureTime]=useState("");
  const [arrivalTime,setArrivalTime]=useState("");
  const [duration,setDuration]=useState(value?.scheduledDurationMinutes?.toString()??"");
  const [distance,setDistance]=useState(value?.distanceNm?.toString()??"");
  const [identityPending,startIdentityTransition]=useTransition();
  const calculatePair=(from:string,to:string)=>{setDeparture(from);setArrival(to);const a=airports.find(x=>x.icao===from),b=airports.find(x=>x.icao===to);if(!a||!b||a.latitude==null||a.longitude==null||b.latitude==null||b.longitude==null)return;const nm=greatCircleDistanceNm({latitude:a.latitude,longitude:a.longitude},{latitude:b.latitude,longitude:b.longitude});const mins=estimatedRouteMinutes(nm);setDistance(String(nm));setDuration(String(mins));setArrivalTime(arrivalTimeUtc(departureTime,mins));};
  return <form action={action} className="route-form">
    {value?.id && <input type="hidden" name="id" value={value.id}/>}<input type="hidden" name="type" value={value?.type ?? "scheduled"}/>
    <fieldset><legend><span>01</span>Route identity</legend><p className="route-form-help">Official vAMSYS identifiers and airport pair.</p><div className="route-form-grid">
      <label>Flight number<div className="route-identity-input"><input name="flightNumber" required value={flightNumber} onChange={e=>setFlightNumber(e.target.value.toUpperCase())} placeholder="HF123"/>{!value?.id&&<button type="button" disabled={identityPending} onClick={()=>startIdentityTransition(async()=>{const next=await suggestRouteIdentityAction();setFlightNumber(next.flightNumber);setCallsign(next.callsign);})}>{identityPending?"…":"Generate"}</button>}</div><small>Unique IATA identity · recorded by AOC</small></label>
      <label>Callsign<input name="callsign" required value={callsign} onChange={e=>setCallsign(e.target.value.toUpperCase())} placeholder="HPF123"/><small>Generated with the same unused number</small></label>
      <label>Departure<select name="departureIcao" required value={departure} onChange={e=>calculatePair(e.target.value,arrival)} disabled={Boolean(value?.id)}><option value="">Select departure airport</option>{airports.map(a=><option key={a.icao} value={a.icao}>{a.icao} · {a.name}</option>)}</select>{value?.id && <input type="hidden" name="departureIcao" value={value.departure}/>}<small>{value?.id ? "Locked after publication" : "Synchronized vAMSYS airport"}</small></label>
      <label>Arrival<select name="arrivalIcao" required value={arrival} onChange={e=>calculatePair(departure,e.target.value)} disabled={Boolean(value?.id)}><option value="">Select arrival airport</option>{airports.map(a=><option key={a.icao} value={a.icao}>{a.icao} · {a.name}</option>)}</select>{value?.id && <input type="hidden" name="arrivalIcao" value={value.arrival}/>}<small>{value?.id ? "Locked after publication" : "Distance and duration calculate automatically"}</small></label>
    </div></fieldset>
    <fieldset><legend><span>02</span>Schedule and performance</legend><p className="route-form-help">All times are UTC. Distance is expressed in nautical miles.</p><div className="route-form-grid route-form-grid-3">
      <label>Departure UTC<input name="departureTime" type="time" step="1" value={departureTime} onChange={e=>{setDepartureTime(e.target.value);setArrivalTime(arrivalTimeUtc(e.target.value,Number(duration)));}}/></label><label>Arrival UTC<input name="arrivalTime" type="time" step="1" value={arrivalTime} onChange={e=>setArrivalTime(e.target.value)}/><small>Calculated from departure + duration</small></label>
      <label>Duration<input name="durationMinutes" type="number" min="1" value={duration} onChange={e=>{setDuration(e.target.value);setArrivalTime(arrivalTimeUtc(departureTime,Number(e.target.value)));}} placeholder="Auto"/><small>Estimated at 430 kt + 30 min</small></label>
      <label>Distance<input name="distanceNm" type="number" min="1" value={distance} onChange={e=>setDistance(e.target.value)} placeholder="Auto"/><small>Great-circle nautical miles</small></label>
      <label>Altitude<input name="altitude" type="number" min="0" defaultValue={value?.cruiseAltitude ?? ""} placeholder="Optional · SimBrief at dispatch"/><small>Leave blank for pilot dispatch</small></label>
      <label>Cost index<input name="costIndex" defaultValue={value?.costIndex ?? ""} placeholder="Optional · SimBrief at dispatch"/><small>Leave blank for pilot dispatch</small></label>
    </div></fieldset>
    <fieldset><legend><span>03</span>Fleet and routing</legend><p className="route-form-help">Select every fleet permitted to operate this route.</p><div className="route-form-grid">
      <div className="route-fleet-field"><strong>Permitted fleets</strong><div className="route-fleet-options">{fleets.filter(f=>f.vamsysFleetId).map(f=><label key={f.id}><input type="checkbox" name="fleetIds" value={f.id} defaultChecked={selected.has(f.id)}/><span>{f.name ?? `Fleet ${f.vamsysFleetId}`}</span></label>)}</div><small>{fleets.filter(f=>f.vamsysFleetId).length} synchronized fleet types available · multiple selection allowed</small></div>
      <label>Operational route<textarea name="route" defaultValue={value?.route ?? ""} placeholder="Optional · SimBrief at dispatch"/><small>Leave blank for pilot dispatch</small></label>
      <label className="route-form-span-2">vAMSYS remarks<textarea name="remarks" placeholder="Visible operational remarks for this route"/></label>
    </div></fieldset>
    <fieldset className="route-internal-section"><legend><span>04</span>HISPAFLY internal</legend><div className="route-form-grid">
      <label className="route-form-span-2">Internal notes<textarea name="internalNotes" defaultValue={value?.internalNotes ?? ""} placeholder="Notes for HISPAFLY staff only"/><small className="field-note">Private AOC data · never sent to vAMSYS</small></label>
      <label className="route-toggle"><input name="hidden" type="checkbox" defaultChecked={value?.operationalStatus === "HIDDEN"}/><span><strong>Hidden in vAMSYS</strong><small>Keep the route synchronized but unavailable for normal operations.</small></span></label>
    </div></fieldset>
    <div className="route-form-submit"><div><strong>{value?.id ? "Publish route changes" : "Ready to publish"}</strong><span>vAMSYS will validate the route before accepting it.</span></div><SubmitButton className="button" pendingChildren="Publishing…">{value?.id ? "Update in vAMSYS" : "Publish to vAMSYS"}</SubmitButton></div>
  </form>;
}
