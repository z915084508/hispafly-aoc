import { Badge, DataTable } from "@/components/data-table";
import { PageHeading } from "@/components/page-heading";
import { FlightOfferForm } from "@/components/flight-offer-form";
import { prisma } from "@/lib/prisma";
import { getFlightOfferOptions } from "@/lib/flightOffers/options";
import { cancelFlightOfferAction, publishFlightOfferAction, reopenFailedFlightOfferAction } from "./actions";
import { getTranslations } from "@/lib/i18n/server";
import { formatCurrency, formatDate, formatNumber } from "@/lib/i18n/core";

export const dynamic = "force-dynamic";

export default async function FlightOffersStaffPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const { t, locale } = await getTranslations();
  const when = (value: Date | null) => value ? formatDate(value, locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC" : "—";
  const reward = (cents: number, type: string) => type === "FIXED" ? formatCurrency(cents, locale) : `${formatNumber(cents / 100, locale)} %`;
  const [messages, offers, options] = await Promise.all([
    searchParams,
    prisma.flightOffer.findMany({ include: { dispatches: { include: { pilot: true, matchedPirep: true } } }, orderBy: { createdAt: "desc" } }),
    getFlightOfferOptions(),
  ]);
  const dispatches = offers.flatMap((offer) => offer.dispatches.map((dispatch) => ({ offer, dispatch })));
  return <>
    <style>{`
      .offer-form { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:14px; }
      .offer-form .wide { grid-column:span 2; }
      .offer-form label { display:flex; flex-direction:column; gap:6px; font-size:12px; font-weight:700; }
      .offer-form input,.offer-form select,.offer-form textarea { border:1px solid #d9dee8; border-radius:9px; padding:10px; background:white; }
      .offer-form textarea { min-height:76px; }
      .offer-actions { display:flex; gap:8px; align-items:center; }
      @media(max-width:1000px){.offer-form{grid-template-columns:repeat(2,minmax(0,1fr));}}
      @media(max-width:650px){.offer-form{grid-template-columns:1fr}.offer-form .wide{grid-column:span 1}}
    `}</style>
    <PageHeading eyebrow={t("flightOffers.eyebrow")} title={t("flightOffers.title")} copy={t("flightOffers.staffCopy")} />
    {messages.success && <div className="feedback success">{messages.success}</div>}
    {messages.error && <div className="feedback error">{messages.error}</div>}

    <section className="card">
      <div className="card-header"><h2 className="card-title">Nueva oferta</h2><span className="meta">Se guarda como DRAFT</span></div>
      <FlightOfferForm {...options} />
    </section>

    <section className="card ranking-card">
      <div className="card-header"><h2 className="card-title">Ofertas</h2><span className="meta">{offers.length} registros</span></div>
      {offers.length ? <DataTable headers={["Oferta", "Ruta", "Periodo disponible", "Duración", "Aeronave", "Recompensa", "Estado", "Acciones"]} rows={offers.map((offer) => [
        (locale === "en" ? offer.titleEn : offer.titleEs) ?? offer.title,
        `${offer.departureIcao}–${offer.arrivalIcao}`,
        `${when(offer.availableFrom)} — ${when(offer.validUntil)}`,
        `${offer.estimatedDurationMinutes} min`,
        offer.aircraftRegistration ?? offer.aircraftType ?? offer.vamsysAircraftId,
        reward(offer.rewardCents, offer.rewardType),
        <Badge key="status" tone={offer.status === "PUBLISHED" ? "green" : offer.status === "CANCELLED" || offer.status === "EXPIRED" ? "red" : "amber"}>{t(`status.${offer.status.toLowerCase()}`)}</Badge>,
        <div className="offer-actions" key="actions">
          {offer.status === "DRAFT" && <form action={publishFlightOfferAction}><input type="hidden" name="id" value={offer.id}/><button className="action-button approve" type="submit">Publicar</button></form>}
          {(offer.status === "DRAFT" || offer.status === "PUBLISHED") && <form action={cancelFlightOfferAction}><input type="hidden" name="id" value={offer.id}/><button className="action-button reject" type="submit">{t("common.cancel")}</button></form>}
        </div>,
      ])} /> : <div className="empty-state">Todavía no hay ofertas de vuelo.</div>}
    </section>

    <section className="card ranking-card">
      <div className="card-header"><h2 className="card-title">Dispatch records</h2><span className="meta">Booking y PIREP matching</span></div>
      {dispatches.length ? <DataTable headers={["Oferta", "Piloto", "Estado", "Booking ID", "PIREP", "Error", "Salida elegida", "Llegada estimada", "Acción"]} rows={dispatches.map(({ offer, dispatch }) => [
        offer.title, dispatch.pilot.displayName, dispatch.status, dispatch.vamsysBookingId ?? "—",
        dispatch.matchedPirep?.flightNumber ?? dispatch.vamsysPirepId ?? "—",
        dispatch.errorMessage ?? "—",
        when(dispatch.selectedDepartureAt ?? dispatch.dispatchedAt),
        when(dispatch.estimatedArrivalAt),
        dispatch.status === "FAILED" ? <form action={reopenFailedFlightOfferAction} key="reopen"><input type="hidden" name="id" value={offer.id}/><button className="action-button approve" type="submit">Reabrir</button></form> : when(dispatch.rewardedAt),
      ])} /> : <div className="empty-state">Todavía no hay vuelos despachados.</div>}
    </section>
  </>;
}
