import Link from "next/link";
import { Badge, DataTable, Identity } from "@/components/data-table";
import { PageHeading } from "@/components/page-heading";
import { PilotPortalShell } from "@/components/pilot-portal-shell";
import { requirePilotSession } from "@/lib/pilot/session";
import { getPilotDashboardData } from "@/lib/pilot/portalData";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const number = (value: number) => new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(value);
const money = (cents: number | null) => cents === null ? "—" : new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(cents / 100);
const route = (departure: string | null, arrival: string | null) => departure || arrival ? `${departure ?? "—"}-${arrival ?? "—"}` : "—";

export default async function PilotDashboardPage() {
  const pilot = await requirePilotSession();
  const [summary, availableOffers, activeDispatches, earnedRewards] = await Promise.all([
    getPilotDashboardData(pilot.id),
    prisma.flightOffer.count({ where: { status: "PUBLISHED", validUntil: { gt: new Date() }, dispatches: { none: {} } } }),
    prisma.flightDispatch.count({ where: { pilotId: pilot.id, status: { in: ["DISPATCHING", "DISPATCHED"] } } }),
    prisma.walletTransaction.aggregate({ where: { pilotId: pilot.id, flightDispatchId: { not: null } }, _sum: { amountCents: true } }),
  ]);

  return <PilotPortalShell>
    <PageHeading eyebrow="PANEL CONTROL" title="Tu actividad mensual" copy="Resumen operativo personal y ranking general del mes actual." />
    <div className="grid stats">
      <div className="card"><div className="stat-label">PIREP aceptado este mes</div><div className="stat-value">{summary.acceptedPireps}</div><div className="stat-note">Solo tus vuelos aceptados</div></div>
      <div className="card"><div className="stat-label">Pasajeros total este mes</div><div className="stat-value">{number(summary.totalPassengers)}</div><div className="stat-note">Desde tus PIREPs aceptados</div></div>
      <div className="card"><div className="stat-label">Mercancía / carga total este mes</div><div className="stat-value">{number(summary.totalCargo)}</div><div className="stat-note">Según payload vAMSYS disponible</div></div>
      <div className="card"><div className="stat-label">Estado del perfil</div><div className="stat-value"><Badge tone={pilot.status === "active" ? "green" : "amber"}>{pilot.status}</Badge></div><div className="stat-note">{pilot.callsign ?? pilot.vamsysPilotId}</div></div>
    </div>
    <div className="grid stats">
      <div className="card"><div className="stat-label">Ofertas disponibles</div><div className="stat-value">{availableOffers}</div><div className="stat-note"><Link href="/pilot/flight-offers">Abrir Self Dispatch</Link></div></div>
      <div className="card"><div className="stat-label">Mis dispatches activos</div><div className="stat-value">{activeDispatches}</div><div className="stat-note">Pendientes de PIREP accepted</div></div>
      <div className="card"><div className="stat-label">Mission rewards</div><div className="stat-value">{money(earnedRewards._sum.amountCents ?? 0)}</div><div className="stat-note">Recompensas ya abonadas</div></div>
    </div>

    <div className="card ranking-card">
      <div className="card-header"><h2 className="card-title">Tus últimos PIREPs aceptados</h2><span className="meta">Detalle por vuelo</span></div>
      {summary.latestPireps.length === 0
        ? <div className="empty-state">Todavía no hay PIREPs aceptados.</div>
        : <DataTable headers={["Vuelo", "Ruta", "Aeronave", "Pasajeros", "Carga", "Ingresos", "Fuel cost", "Fecha", "Detalle"]} rows={summary.latestPireps.map((row) => [
          row.flightNumber ?? row.vamsysPirepId,
          route(row.departure, row.arrival),
          row.aircraftType ?? "—",
          row.passengers ?? "—",
          row.cargoKg === null ? "—" : `${number(row.cargoKg)} kg`,
          money(row.passengerRevenueCents),
          money(row.fuelCostCents),
          new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(row.flownAt ?? row.createdAt),
          <Link key="detail" className="action-button" href={`/pilot/pireps/${row.id}`}>Ver detalle</Link>,
        ])} />}
    </div>

    <div className="card ranking-card">
      <div className="card-header"><h2 className="card-title">Top 5 pilotos por PIREP del mes actual</h2><span className="meta">Todos los pilotos</span></div>
      {summary.topPilots.length === 0
        ? <div className="empty-state">Todavía no hay PIREPs aceptados este mes.</div>
        : <DataTable headers={["#", "Piloto", "PIREPs aceptados"]} rows={summary.topPilots.map((row, index) => [
          <span className="ranking-position" key="pos">{index + 1}</span>,
          <Identity key="pilot" primary={row.name} secondary={row.callsign ?? row.pilotId} />,
          row.count,
        ])} />}
    </div>
  </PilotPortalShell>;
}
