import { Badge, DataTable } from "@/components/data-table";
import { PageHeading } from "@/components/page-heading";
import { PilotBookingForm } from "@/components/pilot-booking-form";
import { PilotPortalShell } from "@/components/pilot-portal-shell";
import { getFlightOfferOptions } from "@/lib/flightOffers/options";
import { requirePilotSession } from "@/lib/pilot/session";
import { prisma } from "@/lib/prisma";
import { cancelPilotBookingAction } from "./actions";
import { getTranslations } from "@/lib/i18n/server";
import { formatDate } from "@/lib/i18n/core";

export const dynamic = "force-dynamic";
export default async function PilotBookingsPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const pilot = await requirePilotSession();
  const { t, locale } = await getTranslations();
  const utc = (value: Date | null) => value ? formatDate(value, locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC" : "—";
  const [messages, options, bookings] = await Promise.all([
    searchParams,
    getFlightOfferOptions(),
    prisma.pilotBooking.findMany({ where: { pilotId: pilot.id }, include: { matchedPirep: true }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  return <PilotPortalShell>
    <PageHeading eyebrow={t("bookings.eyebrow")} title={t("bookings.title")} copy={t("bookings.copy")} />
    {messages.success && <div className="feedback success">{messages.success}</div>}
    {messages.error && <div className="feedback error">{messages.error}</div>}
    <section className="card booking-card">
      <div className="card-header"><h2 className="card-title">{t("bookings.new")}</h2><span className="meta">{t("bookings.noReward")}</span></div>
      <PilotBookingForm routes={options.routes} fleets={options.fleets} aircraft={options.aircraft}/>
    </section>
    <section className="card booking-card">
      <div className="card-header"><h2 className="card-title">{t("bookings.mine")}</h2><span className="meta">vAMSYS Pilot API</span></div>
      {bookings.length ? <DataTable headers={["Flight", t("flightOffers.route"), t("bookings.aircraft"), t("bookings.departureUtc"), t("bookings.estimatedArrival"), t("common.status"), t("bookings.bookingId"), t("bookings.pirep"), t("common.actions")]} rows={bookings.map((booking) => [
        booking.flightNumber ?? booking.callsign ?? "—",
        `${booking.departureIcao}–${booking.arrivalIcao}`,
        booking.aircraftRegistration ?? booking.aircraftType ?? booking.vamsysAircraftId,
        utc(booking.selectedDepartureAt),
        utc(booking.estimatedArrivalAt),
        <Badge key="status" tone={booking.status === "FLOWN" ? "green" : booking.status === "FAILED" ? "red" : "amber"}>{t(`status.${booking.status.toLowerCase()}`)}</Badge>,
        booking.vamsysBookingId,
        booking.matchedPirep?.flightNumber ?? "—",
        booking.status === "BOOKED" ? <form action={cancelPilotBookingAction} key="cancel"><input type="hidden" name="bookingId" value={booking.id}/><button className="action-button reject" type="submit">{t("common.cancel")}</button></form> : "—",
      ])}/> : <div className="empty-state">{t("bookings.none")}</div>}
    </section>
  </PilotPortalShell>;
}
