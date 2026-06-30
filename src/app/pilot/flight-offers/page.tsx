import { Badge, DataTable } from "@/components/data-table";
import { PageHeading } from "@/components/page-heading";
import { PilotPortalShell } from "@/components/pilot-portal-shell";
import { requirePilotSession } from "@/lib/pilot/session";
import { prisma } from "@/lib/prisma";
import { dispatchFlightOfferAction } from "./actions";

export const dynamic = "force-dynamic";

const when = (value: Date | null) => value ? new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(value) : "—";
const reward = (cents: number, type: string) => type === "FIXED"
  ? new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100)
  : `${(cents / 100).toLocaleString("es-ES")} % de nómina`;

function tokenScopes(accessToken: string | undefined) {
  if (!accessToken) return [] as string[];
  try {
    const payloadPart = accessToken.split(".")[1];
    if (!payloadPart) return [];
    const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as { scopes?: unknown; scope?: unknown };
    const value = payload.scopes ?? payload.scope;
    if (Array.isArray(value)) return value.filter((scope): scope is string => typeof scope === "string");
    return typeof value === "string" ? value.split(/\s+/).filter(Boolean) : [];
  } catch { return []; }
}

export default async function PilotFlightOffersPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const pilot = await requirePilotSession();
  const [messages, offers, dispatches, oauth] = await Promise.all([
    searchParams,
    prisma.flightOffer.findMany({ where: { status: "PUBLISHED", validUntil: { gt: new Date() }, dispatches: { none: {} } }, orderBy: { scheduledDeparture: "asc" } }),
    prisma.flightDispatch.findMany({ where: { pilotId: pilot.id }, include: { flightOffer: true, matchedPirep: true, rewardWalletTransaction: true }, orderBy: { createdAt: "desc" } }),
    prisma.vamsysOAuthToken.findUnique({ where: { pilotId: pilot.id }, select: { revokedAt: true, scopes: true, accessToken: true } }),
  ]);
  const storedScopes = oauth?.scopes.split(/\s+/).filter(Boolean) ?? [];
  const actualScopes = tokenScopes(oauth?.accessToken);
  const effectiveScopes = actualScopes.length ? actualScopes : storedScopes;
  const connected = Boolean(oauth && !oauth.revokedAt && effectiveScopes.includes("flights:write"));
  return <PilotPortalShell>
    <PageHeading eyebrow="SELF DISPATCH" title="Ofertas de vuelo" copy="Selecciona una oferta disponible y crea tu booking directamente en vAMSYS." />
    {messages.success && <div className="feedback success">{messages.success}</div>}
    {messages.error && <div className="feedback error">{messages.error}</div>}
    {!connected && <div className="notice">Reconecta vAMSYS para autorizar Self Dispatch (`flights:write`). <a href="/api/vamsys/oauth/start">Autorizar ahora</a></div>}
    <div className="meta">OAuth scopes activos: {effectiveScopes.length ? effectiveScopes.join(" · ") : "No disponibles"}</div>

    <section className="card ranking-card">
      <div className="card-header"><h2 className="card-title">Disponibles</h2><span className="meta">Un piloto por oferta</span></div>
      {offers.length ? <DataTable headers={["Vuelo", "Ruta", "Aeronave", "Salida", "Carga", "Recompensa", "Acción"]} rows={offers.map((offer) => [
        offer.flightNumber ?? offer.title,
        `${offer.departureIcao}–${offer.arrivalIcao}`,
        offer.aircraftRegistration ?? offer.aircraftType ?? "—",
        when(offer.scheduledDeparture),
        `${offer.passengers ?? "—"} pax · ${offer.cargoKg ?? "—"} kg`,
        reward(offer.rewardCents, offer.rewardType),
        connected
          ? <form action={dispatchFlightOfferAction} key="dispatch"><input type="hidden" name="offerId" value={offer.id}/><button className="button" type="submit">Dispatch</button></form>
          : <a className="button" href="/api/vamsys/oauth/start">Autorizar vAMSYS</a>,
      ])} /> : <div className="empty-state">No hay ofertas publicadas disponibles.</div>}
    </section>

    <section className="card ranking-card">
      <div className="card-header"><h2 className="card-title">Mis dispatches</h2><span className="meta">Booking, PIREP y recompensa</span></div>
      {dispatches.length ? <DataTable headers={["Oferta", "Ruta", "Estado", "Booking ID", "PIREP", "Recompensa", "Error", "Fecha"]} rows={dispatches.map((dispatch) => [
        dispatch.flightOffer.title,
        `${dispatch.flightOffer.departureIcao}–${dispatch.flightOffer.arrivalIcao}`,
        <Badge key="status" tone={dispatch.status === "REWARDED" || dispatch.status === "FLOWN" ? "green" : dispatch.status === "FAILED" ? "red" : "amber"}>{dispatch.status}</Badge>,
        dispatch.vamsysBookingId ?? "—",
        dispatch.matchedPirep?.flightNumber ?? dispatch.vamsysPirepId ?? "—",
        dispatch.rewardWalletTransaction ? new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(dispatch.rewardWalletTransaction.amountCents / 100) : reward(dispatch.flightOffer.rewardCents, dispatch.flightOffer.rewardType),
        dispatch.errorMessage ?? "—",
        when(dispatch.dispatchedAt ?? dispatch.createdAt),
      ])} /> : <div className="empty-state">Todavía no has realizado ningún dispatch.</div>}
    </section>
  </PilotPortalShell>;
}
