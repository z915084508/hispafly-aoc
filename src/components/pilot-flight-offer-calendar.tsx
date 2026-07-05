"use client";

import { useMemo, useState } from "react";
import { dispatchFlightOfferAction } from "@/app/pilot/flight-offers/actions";
import { useTranslations } from "@/lib/i18n/client";

export interface CalendarFlightOffer {
  id: string; title: string; flightNumber: string | null; departureIcao: string; arrivalIcao: string;
  aircraftLabel: string; passengers: number | null; loadFactorPercent: number | null;
  availableFrom: string; validUntil: string; durationMinutes: number; rewardLabel: string;
}

const dayKey = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
const utcInput = (date: Date) => `${dayKey(date)}T${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
const dayBounds = (key: string) => { const start = new Date(`${key}T00:00:00Z`), end = new Date(start); end.setUTCHours(23, 59, 59, 999); return { start, end }; };
function feasibleOnDay(offer: CalendarFlightOffer, key: string, now: number) { const { start, end } = dayBounds(key), available = new Date(offer.availableFrom), latest = new Date(new Date(offer.validUntil).getTime() - offer.durationMinutes * 60_000); return available <= end && latest >= start && latest.getTime() >= now; }
function initialDeparture(offer: CalendarFlightOffer, key: string, now: number) { const { start } = dayBounds(key), selected = new Date(Math.max(start.getTime() + 9 * 60 * 60_000, new Date(offer.availableFrom).getTime(), now + 10 * 60_000)); selected.setUTCMinutes(Math.ceil(selected.getUTCMinutes() / 15) * 15, 0, 0); return utcInput(selected); }

export function PilotFlightOfferCalendar({ offers, connected }: { offers: CalendarFlightOffer[]; connected: boolean }) {
  const { t, locale } = useTranslations(), localeCode = locale === "en" ? "en-US" : "es-ES";
  const first = offers[0] ? new Date(offers[0].availableFrom) : new Date();
  const [now] = useState(() => Date.now());
  const [month, setMonth] = useState(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1)));
  const [selectedDay, setSelectedDay] = useState(dayKey(first));
  const [departures, setDepartures] = useState<Record<string, string>>({});
  const days = useMemo(() => { const firstDay = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1)), offset = (firstDay.getUTCDay() + 6) % 7, start = new Date(firstDay); start.setUTCDate(firstDay.getUTCDate() - offset); return Array.from({ length: 42 }, (_, index) => { const date = new Date(start); date.setUTCDate(start.getUTCDate() + index); return date; }); }, [month]);
  const selectedOffers = offers.filter((offer) => feasibleOnDay(offer, selectedDay, now));
  const formatDateTime = (date: Date) => new Intl.DateTimeFormat(localeCode, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(date) + " UTC";

  return <section className="offer-calendar-shell">
    <div className="offer-calendar-toolbar"><button type="button" onClick={() => setMonth((value) => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() - 1, 1)))} aria-label={t("flightOffers.previousMonth")}>‹</button><h2>{new Intl.DateTimeFormat(localeCode, { month: "long", year: "numeric", timeZone: "UTC" }).format(month)}</h2><button type="button" onClick={() => setMonth((value) => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 1)))} aria-label={t("flightOffers.nextMonth")}>›</button></div>
    <div className="offer-calendar-legend"><span/><span>{t("flightOffers.availablePeriod")}</span></div>
    <div className="offer-calendar-grid offer-calendar-weekdays">{t("flightOffers.weekdays").split(",").map((day) => <div key={day}>{day}</div>)}</div>
    <div className="offer-calendar-grid">{days.map((date) => { const key = dayKey(date), available = offers.filter((offer) => feasibleOnDay(offer, key, now)).length; return <button type="button" key={key} className={`offer-calendar-day ${date.getUTCMonth() !== month.getUTCMonth() ? "outside" : ""} ${available ? "available" : ""} ${selectedDay === key ? "selected" : ""}`} onClick={() => { setSelectedDay(key); setDepartures({}); }}><strong>{date.getUTCDate()}</strong>{available > 0 && <span>{t("flightOffers.taskCount", { count: available })}</span>}</button>; })}</div>
    <div className="offer-calendar-selection"><h3>{new Intl.DateTimeFormat(localeCode, { dateStyle: "full", timeZone: "UTC" }).format(new Date(`${selectedDay}T12:00:00Z`))}</h3>
      {selectedOffers.length ? selectedOffers.map((offer) => {
        const departure = departures[offer.id] ?? initialDeparture(offer, selectedDay, now), arrival = departure ? new Date(new Date(`${departure}:00Z`).getTime() + offer.durationMinutes * 60_000) : null, latest = new Date(new Date(offer.validUntil).getTime() - offer.durationMinutes * 60_000);
        return <article className="offer-calendar-card" key={offer.id}><div><span className="offer-calendar-flight">{offer.flightNumber ?? offer.title}</span><strong>{offer.departureIcao} → {offer.arrivalIcao}</strong><small>{offer.aircraftLabel} · {offer.passengers ?? "—"} pax / {offer.loadFactorPercent ?? "—"}% LF · {offer.durationMinutes} min · {offer.rewardLabel}</small></div><form action={dispatchFlightOfferAction}><input type="hidden" name="offerId" value={offer.id}/><input type="hidden" name="selectedDepartureAt" value={departure ? new Date(`${departure}:00Z`).toISOString() : ""}/><label>{t("flightOffers.selectedDepartureUtc")}<input type="datetime-local" value={departure} min={utcInput(new Date(Math.max(new Date(offer.availableFrom).getTime(), now)))} max={utcInput(latest)} onChange={(event) => setDepartures((current) => ({ ...current, [offer.id]: event.target.value }))} required/></label><div className="offer-calendar-arrival"><span>{t("flightOffers.estimatedArrival")}</span><strong>{arrival ? formatDateTime(arrival) : "—"}</strong></div>{connected ? <button className="button" type="submit">{t("flightOffers.confirmDispatch")}</button> : <a className="button" href="/api/vamsys/oauth/start">{t("flightOffers.authorizeVamsys")}</a>}</form></article>;
      }) : <div className="empty-state">{t("flightOffers.noTasksForDay")}</div>}
    </div>
  </section>;
}
