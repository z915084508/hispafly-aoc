import { Badge, DataTable } from "@/components/data-table";
import { PageHeading } from "@/components/page-heading";
import { FlightOfferForm } from "@/components/flight-offer-form";
import { prisma } from "@/lib/prisma";
import { getFlightOfferOptions } from "@/lib/flightOffers/options";
import { cancelFlightOfferAction, publishFlightOfferAction } from "./actions";

export const dynamic = "force-dynamic";

const when = (value: Date | null) => value ? new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(value) : "—";
const reward = (cents: number, type: string) => type === "FIXED"
  ? new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100)
  : `${(cents / 100).toLocaleString("es-ES")} % de nómina`;

export default async function FlightOffersStaffPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
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
    <PageHeading eyebrow="SELF DISPATCH" title="Ofertas de vuelo" copy="Publica vuelos para que un único piloto cree su booking mediante vAMSYS Pilot API." />
    {messages.success && <div className="feedback success">{messages.success}</div>}
    {messages.error && <div className="feedback error">{messages.error}</div>}

    <section className="card">
      <div className="card-header"><h2 className="card-title">Nueva oferta</h2><span className="meta">Se guarda como DRAFT</span></div>
      <FlightOfferForm {...options} />
    </section>

    <section className="card ranking-card">
      <div className="card-header"><h2 className="card-title">Ofertas</h2><span className="meta">{offers.length} registros</span></div>
      {offers.length ? <DataTable headers={["Oferta", "Ruta", "Salida", "Aeronave", "Recompensa", "Estado", "Acciones"]} rows={offers.map((offer) => [
        offer.title,
        `${offer.departureIcao}–${offer.arrivalIcao}`,
        when(offer.scheduledDeparture),
        offer.aircraftRegistration ?? offer.aircraftType ?? offer.vamsysAircraftId,
        reward(offer.rewardCents, offer.rewardType),
        <Badge key="status" tone={offer.status === "PUBLISHED" ? "green" : offer.status === "CANCELLED" || offer.status === "EXPIRED" ? "red" : "amber"}>{offer.status}</Badge>,
        <div className="offer-actions" key="actions">
          {offer.status === "DRAFT" && <form action={publishFlightOfferAction}><input type="hidden" name="id" value={offer.id}/><button className="action-button approve" type="submit">Publicar</button></form>}
          {(offer.status === "DRAFT" || offer.status === "PUBLISHED") && <form action={cancelFlightOfferAction}><input type="hidden" name="id" value={offer.id}/><button className="action-button reject" type="submit">Cancelar</button></form>}
        </div>,
      ])} /> : <div className="empty-state">Todavía no hay ofertas de vuelo.</div>}
    </section>

    <section className="card ranking-card">
      <div className="card-header"><h2 className="card-title">Dispatch records</h2><span className="meta">Booking y PIREP matching</span></div>
      {dispatches.length ? <DataTable headers={["Oferta", "Piloto", "Estado", "Booking ID", "PIREP", "Dispatch", "Rewarded"]} rows={dispatches.map(({ offer, dispatch }) => [
        offer.title, dispatch.pilot.displayName, dispatch.status, dispatch.vamsysBookingId ?? "—",
        dispatch.matchedPirep?.flightNumber ?? dispatch.vamsysPirepId ?? "—", when(dispatch.dispatchedAt), when(dispatch.rewardedAt),
      ])} /> : <div className="empty-state">Todavía no hay vuelos despachados.</div>}
    </section>
  </>;
}
