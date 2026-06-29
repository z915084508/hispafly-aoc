import { Badge, DataTable, Identity } from "@/components/data-table";
import { PageHeading } from "@/components/page-heading";
import { PilotPortalShell } from "@/components/pilot-portal-shell";
import { requirePilotSession } from "@/lib/pilot/session";
import { getPilotDashboardData } from "@/lib/pilot/portalData";

export const dynamic = "force-dynamic";

const number = (value: number) => new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(value);

export default async function PilotDashboardPage() {
  const pilot = await requirePilotSession();
  const summary = await getPilotDashboardData(pilot.id);

  return <PilotPortalShell>
    <PageHeading eyebrow="PANEL CONTROL" title="Tu actividad mensual" copy="Resumen operativo personal y ranking general del mes actual." />
    <div className="grid stats">
      <div className="card"><div className="stat-label">PIREP aceptado este mes</div><div className="stat-value">{summary.acceptedPireps}</div><div className="stat-note">Solo tus vuelos aceptados</div></div>
      <div className="card"><div className="stat-label">Pasajeros total este mes</div><div className="stat-value">{number(summary.totalPassengers)}</div><div className="stat-note">Desde tus PIREPs aceptados</div></div>
      <div className="card"><div className="stat-label">Mercancía / carga total este mes</div><div className="stat-value">{number(summary.totalCargo)}</div><div className="stat-note">Según payload vAMSYS disponible</div></div>
      <div className="card"><div className="stat-label">Estado del perfil</div><div className="stat-value"><Badge tone={pilot.status === "active" ? "green" : "amber"}>{pilot.status}</Badge></div><div className="stat-note">{pilot.callsign ?? pilot.vamsysPilotId}</div></div>
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
