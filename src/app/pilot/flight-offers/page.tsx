import { Badge, DataTable } from "@/components/data-table";
import { PageHeading } from "@/components/page-heading";
import { PilotPortalShell } from "@/components/pilot-portal-shell";
import { requirePilotSession } from "@/lib/pilot/session";
import { prisma } from "@/lib/prisma";
import { expireOverdueFlightDispatches } from "@/lib/flightOffers/service";
import { PilotFlightOfferCalendar } from "@/components/pilot-flight-offer-calendar";
import { cancelFlightDispatchAction } from "./actions";
import { getTranslations } from "@/lib/i18n/server";
import { formatCurrency, formatDate, formatNumber } from "@/lib/i18n/core";

export const dynamic = "force-dynamic";

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

export default async function PilotFlightOffersPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string; dispatchId?: string }> }) {
  const pilot = await requirePilotSession();
  const { t, locale } = await getTranslations();
  const when = (value: Date | null) => value ? formatDate(value, locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC" : "—";
  const reward = (cents: number, type: string) => type === "FIXED" ? formatCurrency(cents, locale) : `${formatNumber(cents / 100, locale)} %`;
  await expireOverdueFlightDispatches(10, pilot.id);
  const [messages, offers, dispatches, oauth] = await Promise.all([
    searchParams,
    prisma.flightOffer.findMany({ where: { status: "PUBLISHED", validUntil: { gt: new Date() }, dispatches: { none: { status: { in: ["DISPATCHING", "DISPATCHED"] } } } }, orderBy: { availableFrom: "asc" } }),
    prisma.flightDispatch.findMany({ where: { pilotId: pilot.id }, include: { flightOffer: true, matchedPirep: true, rewardWalletTransaction: true }, orderBy: { createdAt: "desc" } }),
    prisma.vamsysOAuthToken.findUnique({ where: { pilotId: pilot.id }, select: { revokedAt: true, scopes: true, accessToken: true } }),
  ]);
  const storedScopes = oauth?.scopes.split(/\s+/).filter(Boolean) ?? [];
  const actualScopes = tokenScopes(oauth?.accessToken);
  const effectiveScopes = actualScopes.length ? actualScopes : storedScopes;
  const connected = Boolean(oauth && !oauth.revokedAt && effectiveScopes.includes("flights:write"));
  const bookingDetail = messages.dispatchId ? dispatches.find((item) => item.id === messages.dispatchId) : null;
  return <PilotPortalShell>
    <PageHeading eyebrow={t("flightOffers.eyebrow")} title={t("flightOffers.title")} copy={t("flightOffers.pilotCopy")} />
    {messages.success && <div className="feedback success">{messages.success}</div>}
    {messages.error && <div className="feedback error">{messages.error}</div>}
    {bookingDetail && <section className="card booking-confirmation-card"><div className="card-header"><h2 className="card-title">{t("flightOffers.bookingDetail")}</h2><Badge tone="green">{t("status.dispatched")}</Badge></div><div className="workflow-summary"><div><span>{t("bookings.bookingId")}</span><strong>{bookingDetail.vamsysBookingId ?? "—"}</strong></div><div><span>{t("flightOffers.route")}</span><strong>{bookingDetail.flightOffer.departureIcao} → {bookingDetail.flightOffer.arrivalIcao}</strong></div><div><span>{t("bookings.aircraft")}</span><strong>{bookingDetail.flightOffer.aircraftRegistration ?? bookingDetail.flightOffer.aircraftType ?? bookingDetail.flightOffer.vamsysAircraftId}</strong></div><div><span>{t("flightOffers.selectedDepartureUtc")}</span><strong>{when(bookingDetail.selectedDepartureAt)}</strong></div><div><span>{t("flightOffers.estimatedArrival")}</span><strong>{when(bookingDetail.estimatedArrivalAt)}</strong></div><div><span>{t("flightOffers.reward")}</span><strong>{reward(bookingDetail.flightOffer.rewardCents, bookingDetail.flightOffer.rewardType)}</strong></div></div></section>}
    {!connected && <div className="notice">Reconecta vAMSYS para autorizar Self Dispatch (`flights:write`). <a href="/api/vamsys/oauth/start">Autorizar ahora</a></div>}
    <PilotFlightOfferCalendar connected={connected} offers={offers.map((offer) => ({
      id: offer.id,
      title: (locale === "en" ? offer.titleEn : offer.titleEs) ?? offer.title,
      flightNumber: offer.flightNumber,
      departureIcao: offer.departureIcao,
      arrivalIcao: offer.arrivalIcao,
      aircraftLabel: offer.aircraftRegistration ?? offer.aircraftType ?? "Aeronave asignada",
      availableFrom: offer.availableFrom.toISOString(),
      validUntil: offer.validUntil.toISOString(),
      durationMinutes: offer.estimatedDurationMinutes,
      rewardLabel: reward(offer.rewardCents, offer.rewardType),
    }))} />

    <section className="card ranking-card">
      <div className="card-header"><h2 className="card-title">{t("flightOffers.myDispatches")}</h2><span className="meta">{t("flightOffers.bookingPirepReward")}</span></div>
      {dispatches.length ? <DataTable headers={[t("flightOffers.title"), t("flightOffers.route"), t("common.status"), "Booking ID", "PIREP", t("flightOffers.reward"), t("flightOffers.selectedDeparture"), t("flightOffers.validUntil"), t("common.actions")]} rows={dispatches.map((dispatch) => [
        (locale === "en" ? dispatch.flightOffer.titleEn : dispatch.flightOffer.titleEs) ?? dispatch.flightOffer.title,
        `${dispatch.flightOffer.departureIcao}–${dispatch.flightOffer.arrivalIcao}`,
        <Badge key="status" tone={dispatch.status === "REWARDED" || dispatch.status === "FLOWN" ? "green" : dispatch.status === "FAILED" ? "red" : "amber"}>{t(`status.${dispatch.status.toLowerCase()}`)}</Badge>,
        dispatch.vamsysBookingId ?? "—",
        dispatch.matchedPirep?.flightNumber ?? dispatch.vamsysPirepId ?? "—",
        dispatch.rewardWalletTransaction ? formatCurrency(dispatch.rewardWalletTransaction.amountCents, locale) : reward(dispatch.flightOffer.rewardCents, dispatch.flightOffer.rewardType),
        when(dispatch.selectedDepartureAt ?? dispatch.dispatchedAt ?? dispatch.createdAt),
        when(dispatch.flightOffer.validUntil),
        dispatch.status === "DISPATCHED" && dispatch.flightOffer.validUntil > new Date()
          ? <form action={cancelFlightDispatchAction} key="cancel"><input type="hidden" name="dispatchId" value={dispatch.id}/><button className="action-button reject" type="submit">{t("common.cancel")} (-50 €)</button></form>
          : dispatch.status === "EXPIRED" ? "Expirada (-100 €)" : dispatch.status === "CANCELLED" ? "Cancelada" : "—",
      ])} /> : <div className="empty-state">{t("flightOffers.noDispatches")}</div>}
    </section>
  </PilotPortalShell>;
}
