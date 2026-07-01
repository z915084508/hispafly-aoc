import { Badge, DataTable } from "@/components/data-table";
import { PageHeading } from "@/components/page-heading";
import { PilotBookingForm } from "@/components/pilot-booking-form";
import { PilotPortalShell } from "@/components/pilot-portal-shell";
import { getFlightOfferOptions } from "@/lib/flightOffers/options";
import { requirePilotSession } from "@/lib/pilot/session";
import { prisma } from "@/lib/prisma";
import { cancelPilotBookingAction } from "./actions";

export const dynamic = "force-dynamic";
const utc = (value: Date | null) => value ? new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(value) + " UTC" : "—";

export default async function PilotBookingsPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const pilot = await requirePilotSession();
  const [messages, options, bookings] = await Promise.all([
    searchParams,
    getFlightOfferOptions(),
    prisma.pilotBooking.findMany({ where: { pilotId: pilot.id }, include: { matchedPirep: true }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  return <PilotPortalShell>
    <PageHeading eyebrow="SELF DISPATCH" title="Reservar vuelo" copy="Crea un booking ordinario directamente en vAMSYS. Todas las horas se muestran en UTC." />
    {messages.success && <div className="feedback success">{messages.success}</div>}
    {messages.error && <div className="feedback error">{messages.error}</div>}
    <section className="card ranking-card">
      <div className="card-header"><h2 className="card-title">Nuevo booking</h2><span className="meta">Sin recompensa ni penalización de tarea</span></div>
      <PilotBookingForm routes={options.routes} fleets={options.fleets} aircraft={options.aircraft}/>
    </section>
    <section className="card ranking-card">
      <div className="card-header"><h2 className="card-title">Mis bookings</h2><span className="meta">vAMSYS Pilot API</span></div>
      {bookings.length ? <DataTable headers={["Vuelo", "Ruta", "Aircraft", "Salida UTC", "Llegada estimada", "Estado", "Booking ID", "PIREP", "Acción"]} rows={bookings.map((booking) => [
        booking.flightNumber ?? booking.callsign ?? "—",
        `${booking.departureIcao}–${booking.arrivalIcao}`,
        booking.aircraftRegistration ?? booking.aircraftType ?? booking.vamsysAircraftId,
        utc(booking.selectedDepartureAt),
        utc(booking.estimatedArrivalAt),
        <Badge key="status" tone={booking.status === "FLOWN" ? "green" : booking.status === "FAILED" ? "red" : "amber"}>{booking.status}</Badge>,
        booking.vamsysBookingId,
        booking.matchedPirep?.flightNumber ?? "—",
        booking.status === "BOOKED" ? <form action={cancelPilotBookingAction} key="cancel"><input type="hidden" name="bookingId" value={booking.id}/><button className="action-button reject" type="submit">Cancelar</button></form> : "—",
      ])}/> : <div className="empty-state">Todavía no has creado ningún booking ordinario.</div>}
    </section>
  </PilotPortalShell>;
}
