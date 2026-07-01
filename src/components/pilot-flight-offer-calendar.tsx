"use client";

import { useMemo, useState } from "react";
import { dispatchFlightOfferAction } from "@/app/pilot/flight-offers/actions";
import { useTranslations } from "@/lib/i18n/client";

export interface CalendarFlightOffer {
  id: string;
  title: string;
  flightNumber: string | null;
  departureIcao: string;
  arrivalIcao: string;
  aircraftLabel: string;
  availableFrom: string;
  validUntil: string;
  durationMinutes: number;
  rewardLabel: string;
}

const dayKey = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
const utcInput = (date: Date) => `${dayKey(date)}T${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
const formatDateTime = (date: Date) => new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(date) + " UTC";

function dayBounds(key: string) {
  const start = new Date(`${key}T00:00:00Z`);
  const end = new Date(start); end.setUTCHours(23, 59, 59, 999);
  return { start, end };
}

function feasibleOnDay(offer: CalendarFlightOffer, key: string) {
  const { start, end } = dayBounds(key);
  const available = new Date(offer.availableFrom);
  const latestDeparture = new Date(new Date(offer.validUntil).getTime() - offer.durationMinutes * 60_000);
  return available <= end && latestDeparture >= start && latestDeparture >= new Date();
}

function initialDeparture(offer: CalendarFlightOffer, key: string) {
  const { start } = dayBounds(key);
  const now = new Date();
  let selected = new Date(Math.max(start.getTime() + 9 * 60 * 60_000, new Date(offer.availableFrom).getTime(), now.getTime() + 10 * 60_000));
  selected.setUTCMinutes(Math.ceil(selected.getUTCMinutes() / 15) * 15, 0, 0);
  return utcInput(selected);
}

export function PilotFlightOfferCalendar({ offers, connected }: { offers: CalendarFlightOffer[]; connected: boolean }) {
  const { locale } = useTranslations();
  const first = offers[0] ? new Date(offers[0].availableFrom) : new Date();
  const [month, setMonth] = useState(new Date(first.getFullYear(), first.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState(dayKey(first));
  const [departures, setDepartures] = useState<Record<string, string>>({});

  const days = useMemo(() => {
    const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
    const mondayOffset = (firstDay.getDay() + 6) % 7;
    const start = new Date(firstDay); start.setDate(firstDay.getDate() - mondayOffset);
    return Array.from({ length: 42 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return date; });
  }, [month]);
  const selectedOffers = offers.filter((offer) => feasibleOnDay(offer, selectedDay));

  function moveMonth(delta: number) {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  }

  function departureFor(offer: CalendarFlightOffer) {
    return departures[offer.id] ?? initialDeparture(offer, selectedDay);
  }

  return <section className="offer-calendar-shell">
    <div className="offer-calendar-toolbar">
      <button type="button" onClick={() => moveMonth(-1)} aria-label="Mes anterior">‹</button>
      <h2>{new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-ES", { month: "long", year: "numeric", timeZone: "UTC" }).format(month)}</h2>
      <button type="button" onClick={() => moveMonth(1)} aria-label="Mes siguiente">›</button>
    </div>
    <div className="offer-calendar-legend"><span/><span>Periodo disponible</span></div>
    <div className="offer-calendar-grid offer-calendar-weekdays">{["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((day) => <div key={day}>{day}</div>)}</div>
    <div className="offer-calendar-grid">
      {days.map((date) => {
        const key = dayKey(date);
        const available = offers.filter((offer) => feasibleOnDay(offer, key)).length;
        return <button
          type="button"
          key={key}
          className={`offer-calendar-day ${date.getMonth() !== month.getMonth() ? "outside" : ""} ${available ? "available" : ""} ${selectedDay === key ? "selected" : ""}`}
          onClick={() => { setSelectedDay(key); setDepartures({}); }}
        >
          <strong>{date.getDate()}</strong>
          {available > 0 && <span>{available} tarea{available > 1 ? "s" : ""}</span>}
        </button>;
      })}
    </div>

    <div className="offer-calendar-selection">
      <h3>{new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-ES", { dateStyle: "full", timeZone: "UTC" }).format(new Date(`${selectedDay}T12:00:00Z`))}</h3>
      {selectedOffers.length ? selectedOffers.map((offer) => {
        const departure = departureFor(offer);
        const arrival = departure ? new Date(new Date(`${departure}:00Z`).getTime() + offer.durationMinutes * 60_000) : null;
        const latestDeparture = new Date(new Date(offer.validUntil).getTime() - offer.durationMinutes * 60_000);
        return <article className="offer-calendar-card" key={offer.id}>
          <div><span className="offer-calendar-flight">{offer.flightNumber ?? offer.title}</span><strong>{offer.departureIcao} → {offer.arrivalIcao}</strong><small>{offer.aircraftLabel} · {offer.durationMinutes} min · {offer.rewardLabel}</small></div>
          <form action={dispatchFlightOfferAction}>
            <input type="hidden" name="offerId" value={offer.id}/>
            <input type="hidden" name="selectedDepartureAt" value={departure ? new Date(`${departure}:00Z`).toISOString() : ""}/>
            <label>Salida elegida (UTC)<input
              type="datetime-local"
              value={departure}
              min={utcInput(new Date(Math.max(new Date(offer.availableFrom).getTime(), Date.now())))}
              max={utcInput(latestDeparture)}
              onChange={(event) => setDepartures((current) => ({ ...current, [offer.id]: event.target.value }))}
              required
            /></label>
            <div className="offer-calendar-arrival"><span>Llegada estimada</span><strong>{arrival ? formatDateTime(arrival) : "—"}</strong></div>
            {connected ? <button className="button" type="submit">Confirmar Dispatch</button> : <a className="button" href="/api/vamsys/oauth/start">Autorizar vAMSYS</a>}
          </form>
        </article>;
      }) : <div className="empty-state">No hay tareas disponibles para este día.</div>}
    </div>
  </section>;
}
