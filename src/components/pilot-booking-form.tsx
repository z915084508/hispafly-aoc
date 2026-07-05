"use client";

import { useMemo, useState } from "react";
import { createPilotBookingAction } from "@/app/pilot/bookings/actions";
import { getPilotRouteDetailsAction } from "@/app/pilot/bookings/actions";
import type { FlightOfferRouteOption } from "@/lib/flightOffers/options";
import { useTranslations } from "@/lib/i18n/client";
import { calculateDispatchPayload, suggestedLoadFactor } from "@/lib/dispatch/loadFactor";

type FleetOption = { id: string; name: string | null; code: string | null; passengers: number | null; cargoKg: number | null };
type AircraftOption = { vamsysAircraftId: string; registration: string | null; aircraftType: string | null; fleetId: string | null; status: string | null; seatCapacity: number | null };

const isoFromUtcInput = (value: string) => value ? new Date(`${value}:00Z`).toISOString() : "";
const utcInput = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}T${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;

export function PilotBookingForm({ routes, fleets, aircraft }: { routes: FlightOfferRouteOption[]; fleets: FleetOption[]; aircraft: AircraftOption[] }) {
  const { t, locale } = useTranslations();
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
  const [loadFactorPercent, setLoadFactorPercent] = useState("80");
  const [baggageKgPerPassenger, setBaggageKgPerPassenger] = useState("23");
  const [passengers, setPassengers] = useState("");
  const [luggageKg, setLuggageKg] = useState("");
  const [minimumDeparture] = useState(() => utcInput(new Date(Date.now() + 5 * 60_000)));
  const route = routes.find((item) => item.id === routeId) ?? null;
  const departureChoices = useMemo(() => [...new Set(routes.filter((item) => !arrival || item.arrival === arrival).map((item) => item.departure))].sort(), [routes, arrival]);
  const arrivalChoices = useMemo(() => [...new Set(routes.filter((item) => !departure || item.departure === departure).map((item) => item.arrival))].sort(), [routes, departure]);
  const routeChoices = routes.filter((item) => (!departure || item.departure === departure) && (!arrival || item.arrival === arrival));
  const compatibleFleetIds = routeFleetIds ?? route?.fleetIds ?? [];
  const fleetChoices = compatibleFleetIds.length ? fleets.filter((fleet) => compatibleFleetIds.includes(fleet.id)) : fleets;
  const aircraftChoices = aircraft.filter((item) => (!fleetId || item.fleetId === fleetId) && (!compatibleFleetIds.length || (item.fleetId && compatibleFleetIds.includes(item.fleetId))));
  const selectedAircraft = aircraft.find((item) => item.vamsysAircraftId === aircraftId) ?? null;
  const effectiveDuration = durationMinutes ?? route?.durationMinutes ?? null;
  const arrivalAt = effectiveDuration && departureAt ? new Date(new Date(isoFromUtcInput(departureAt)).getTime() + effectiveDuration * 60_000) : null;
  const displayUtc = (date: Date) => new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-ES", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(date) + " UTC";

  function recalculatePayload(nextAircraftId = aircraftId, nextLoadFactor = loadFactorPercent, nextBaggage = baggageKgPerPassenger) {
    const selected = aircraft.find((item) => item.vamsysAircraftId === nextAircraftId);
    if (!selected?.seatCapacity) { setPassengers(""); setLuggageKg(""); return; }
    const loadFactor = Number(nextLoadFactor), baggage = Number(nextBaggage);
    if (!Number.isFinite(loadFactor) || loadFactor < 0 || loadFactor > 100 || !Number.isFinite(baggage) || baggage < 0) { setPassengers(""); setLuggageKg(""); return; }
    const payload = calculateDispatchPayload({ seats: selected.seatCapacity, loadFactorPercent: loadFactor, baggageKgPerPassenger: baggage });
    setPassengers(String(payload.passengers)); setLuggageKg(String(payload.luggageKg));
  }

  function updateDepartureAt(value: string) {
    setDepartureAt(value);
    if (!route || !value) return;
    const suggested = suggestedLoadFactor({ departure: route.departure, arrival: route.arrival, departureAt: new Date(isoFromUtcInput(value)) });
    setLoadFactorPercent(String(suggested));
    recalculatePayload(aircraftId, String(suggested), baggageKgPerPassenger);
  }

  async function chooseRoute(value: string) {
    setRouteId(value); setFleetId(""); setAircraftId(""); setRouteFleetIds(null); setRouteError(null); setDurationMinutes(null);
    const selected = routes.find((item) => item.id === value);
    if (selected) { setDeparture(selected.departure); setArrival(selected.arrival); }
    if (!value) return;
    setRouteLoading(true);
    const details = await getPilotRouteDetailsAction(value);
    setRouteFleetIds(details.fleetIds); setDurationMinutes(details.durationMinutes); setRouteError(details.error); setRouteLoading(false);
  }

  return <form className="pilot-booking-form" action={createPilotBookingAction}>
    <input type="hidden" name="departureAt" value={isoFromUtcInput(departureAt)}/>
    <fieldset>
      <legend><span>01</span> {t("bookings.routeAircraft")}</legend>
      <div className="pilot-booking-grid">
        <label>{t("bookings.departure")}<select value={departure} onChange={(event) => { const value = event.target.value; setDeparture(value); if (arrival && !routes.some((item) => item.departure === value && item.arrival === arrival)) setArrival(""); setRouteId(""); setFleetId(""); setAircraftId(""); }} required><option value="">{t("bookings.selectAirport")}</option>{departureChoices.map((icao) => <option key={icao}>{icao}</option>)}</select></label>
        <label>{t("bookings.arrival")}<select value={arrival} onChange={(event) => { const value = event.target.value; setArrival(value); if (departure && !routes.some((item) => item.departure === departure && item.arrival === value)) setDeparture(""); setRouteId(""); setFleetId(""); setAircraftId(""); }} required><option value="">{t("bookings.selectAirport")}</option>{arrivalChoices.map((icao) => <option key={icao}>{icao}</option>)}</select></label>
        <label className="span-2">{t("bookings.route")}<select name="routeId" value={routeId} onChange={(event) => void chooseRoute(event.target.value)} required><option value="">{t("bookings.selectRoute")}</option>{routeChoices.map((item) => <option value={item.id} key={item.id}>{item.flightNumber ?? item.callsign ?? item.id} · {item.departure}-{item.arrival}</option>)}</select></label>
        <label>{t("bookings.compatibleFleet")}<select name="fleetId" value={fleetId} onChange={(event) => { setFleetId(event.target.value); setAircraftId(""); }} disabled={!routeId || routeLoading} required><option value="">{routeLoading ? "vAMSYS…" : t("bookings.selectFleet")}</option>{fleetChoices.map((fleet) => <option value={fleet.id} key={fleet.id}>{fleet.name ?? fleet.code ?? fleet.id}</option>)}</select>{routeError && <span className="field-note">{routeError}</span>}</label>
        <label>{t("bookings.aircraft")}<select name="aircraftId" value={aircraftId} onChange={(event) => { setAircraftId(event.target.value); recalculatePayload(event.target.value); }} disabled={!fleetId} required><option value="">{t("bookings.selectAircraft")}</option>{aircraftChoices.map((item) => <option value={item.vamsysAircraftId} key={item.vamsysAircraftId}>{item.registration ?? item.vamsysAircraftId} · {item.aircraftType ?? "—"} · {item.seatCapacity ?? "?"} seats</option>)}</select></label>
        <label>Flight number<input value={route?.flightNumber ?? ""} placeholder="Se completa con la ruta" readOnly/></label>
        <label>{t("bookings.aircraftType")}<input value={selectedAircraft?.aircraftType ?? ""} readOnly/></label>
      </div>
    </fieldset>
    <fieldset>
      <legend><span>02</span> {t("bookings.schedule")}</legend>
      <div className="pilot-booking-grid">
        <label>{t("bookings.departureUtc")}<input type="datetime-local" value={departureAt} min={minimumDeparture} onChange={(event) => updateDepartureAt(event.target.value)} required/></label>
        <label>{t("bookings.arrivalUtc")}<input value={arrivalAt ? displayUtc(arrivalAt) : t("bookings.calculatedByApi")} readOnly/></label>
        <div className="booking-time-note span-2">{t("bookings.arrivalHint")}</div>
      </div>
    </fieldset>
    <fieldset>
      <legend><span>03</span> {t("bookings.operationsLoad")}</legend>
      <div className="pilot-booking-grid">
        <label key={`callsign-${routeId}`}>Callsign<input name="callsign" defaultValue={route?.callsign ?? ""} maxLength={7}/></label>
        <label>{t("bookings.network")}<select name="network" defaultValue="vatsim"><option value="vatsim">VATSIM</option><option value="ivao">IVAO</option><option value="poscon">POSCON</option><option value="offline">Offline</option><option value="other">Other</option></select></label>
        <label key={`altitude-${routeId}`}>{t("bookings.altitude")}<input name="altitude" type="number" min="10" max="70000" defaultValue={route?.altitude ?? undefined}/></label>
        <label>HISPAFLY Load Factor %<input name="loadFactorPercent" value={loadFactorPercent} onChange={(event) => { setLoadFactorPercent(event.target.value); recalculatePayload(aircraftId, event.target.value); }} type="number" min="25" max="100" step="0.1" required/></label>
        <label>Maximum seats<input value={selectedAircraft?.seatCapacity ?? ""} readOnly/></label>
        <label>{t("bookings.passengers")}<input value={passengers} readOnly/></label>
        <label>Baggage per passenger kg<input name="baggageKgPerPassenger" value={baggageKgPerPassenger} onChange={(event) => { setBaggageKgPerPassenger(event.target.value); recalculatePayload(aircraftId, loadFactorPercent, event.target.value); }} type="number" min="0" step="0.1" required/></label>
        <label>Passenger luggage kg<input value={luggageKg} readOnly/></label>
        <label>Commercial freight kg<input name="freightKg" type="number" min="0" defaultValue="0"/></label>
        <label className="span-3" key={`user-route-${routeId}`}>{t("bookings.operationalRoute")}<textarea name="userRoute" defaultValue={route?.userRoute ?? ""}/></label>
      </div>
    </fieldset>
    <div className="pilot-booking-submit"><div><strong>Ready to prepare OFP</strong><span>The vAMSYS booking is created only after OFP review and signature.</span></div><button className="button" type="submit" disabled={!routeId || !fleetId || !aircraftId || !departureAt || !passengers}>PREPARE OFP</button></div>
  </form>;
}
